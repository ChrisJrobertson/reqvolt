import { z } from "zod";
import { router, workspaceProcedure, adminProcedure } from "../trpc";
import { db } from "../db";
import { SourceType } from "@prisma/client";
import { auditService } from "../services/audit";
import { inngest } from "../inngest/client";
import {
  getJiraClient,
  searchJiraIssues,
  type JiraClient,
} from "../services/jira";

const BATCH_SIZE = 10;

function adfToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  if (typeof obj.text === "string") return obj.text;
  if (Array.isArray(obj.content)) {
    const parts = obj.content.map((c: unknown) => adfToPlainText(c));
    const sep = obj.type === "paragraph" || obj.type === "heading" ? "\n" : "";
    return parts.join(sep);
  }
  return "";
}

function atlassianStorageToPlainText(storage: unknown): string {
  if (!storage || typeof storage !== "object") return "";
  const obj = storage as Record<string, unknown>;
  if (typeof obj.value === "string") return obj.value;
  if (Array.isArray(obj.content)) {
    return obj.content.map((c: unknown) => adfToPlainText(c)).join("\n");
  }
  return adfToPlainText(storage);
}

async function fetchConfluencePage(
  client: JiraClient,
  pageId: string
): Promise<{ title: string; body: string; spaceKey?: string; lastModified?: string } | null> {
  const res = await fetch(
    `https://api.atlassian.com/ex/confluence/${client.cloudId}/rest/api/content/${pageId}?expand=body.storage,version,space`,
    {
      headers: {
        Authorization: `Bearer ${client.accessToken}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    title?: string;
    body?: { storage?: { value?: string; content?: unknown } };
    version?: { when?: string };
    space?: { key?: string };
  };
  const body =
    data.body?.storage?.value ??
    atlassianStorageToPlainText(data.body?.storage?.content ?? data.body?.storage);
  return {
    title: data.title ?? "Untitled",
    body: typeof body === "string" ? body : "",
    spaceKey: data.space?.key,
    lastModified: data.version?.when,
  };
}

async function fetchConfluenceSpaces(client: JiraClient): Promise<Array<{ key: string; name: string }>> {
  const res = await fetch(
    `https://api.atlassian.com/ex/confluence/${client.cloudId}/rest/api/space`,
    {
      headers: {
        Authorization: `Bearer ${client.accessToken}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<{ key: string; name: string }> };
  return data.results ?? [];
}

async function searchConfluencePages(
  client: JiraClient,
  spaceKey: string,
  query?: string
): Promise<Array<{ id: string; title: string }>> {
  const cql = query
    ? `space = "${spaceKey}" AND type = page AND text ~ "${query.replace(/"/g, '\\"')}"`
    : `space = "${spaceKey}" AND type = page`;
  const res = await fetch(
    `https://api.atlassian.com/ex/confluence/${client.cloudId}/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=50`,
    {
      headers: {
        Authorization: `Bearer ${client.accessToken}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: Array<{ content?: { id: string; title: string } }> };
  return (data.results ?? []).map((r) => ({
    id: r.content?.id ?? "",
    title: r.content?.title ?? "Untitled",
  })).filter((p) => p.id);
}

export const importRouter = router({
  csvSources: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        rows: z.array(
          z.object({
            name: z.string().min(1),
            content: z.string().min(1),
            type: z.nativeEnum(SourceType).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new Error("Project not found");

      const errors: string[] = [];
      let imported = 0;

      for (let i = 0; i < input.rows.length; i += BATCH_SIZE) {
        const batch = input.rows.slice(i, i + BATCH_SIZE);
        await db.$transaction(async (tx) => {
          for (const row of batch) {
            try {
              const source = await tx.source.create({
                data: {
                  workspaceId: ctx.workspaceId,
                  projectId: input.projectId,
                  type: row.type ?? SourceType.OTHER,
                  name: row.name.slice(0, 255),
                  content: row.content,
                  metadata: (row.metadata ?? {}) as object,
                  status: "completed",
                },
              });
              imported++;
              await inngest.send({
                name: "source/chunk-and-embed",
                data: {
                  sourceId: source.id,
                  workspaceId: ctx.workspaceId,
                  projectId: input.projectId,
                },
              });
            } catch (e) {
              errors.push(`Row ${i + batch.indexOf(row) + 1}: ${e instanceof Error ? e.message : "Unknown error"}`);
            }
          }
        });
      }

      for (let j = 0; j < imported; j++) {
        await auditService.log({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: "source.create",
          entityType: "Source",
          entityId: "import",
          metadata: { type: "csv_import", projectId: input.projectId },
        });
      }

      return {
        imported,
        failed: input.rows.length - imported,
        errors: errors.slice(0, 10),
      };
    }),

  jiraIssuesAsPack: adminProcedure
    .input(
      z.object({
        projectId: z.string(),
        jql: z.string().min(1),
        packName: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getJiraClient(ctx.workspaceId);
      if (!client) throw new Error("Jira not connected");

      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new Error("Project not found");

      const issues = await searchJiraIssues(client, input.jql, [
        "summary",
        "description",
        "issuetype",
      ]);

      const pack = await db.pack.create({
        data: {
          projectId: input.projectId,
          workspaceId: ctx.workspaceId,
          name: input.packName,
        },
      });

      const version = await db.packVersion.create({
        data: {
          packId: pack.id,
          versionNumber: 1,
          sourceIds: [],
        },
      });

      let sortOrder = 0;
      for (const issue of issues) {
        const summary = (issue.fields as { summary?: string }).summary ?? issue.key;
        const desc = (issue.fields as { description?: unknown }).description;
        let body = "";
        if (desc) {
          body = atlassianStorageToPlainText(desc);
        }
        const parts = summary.split(/\s+as\s+a\s+/i);
        const persona = parts[0]?.trim() ?? "User";
        const want = parts[1]?.trim() ?? summary;
        const soThat = body.slice(0, 200);

        const story = await db.story.create({
          data: {
            packVersionId: version.id,
            sortOrder: sortOrder++,
            persona,
            want,
            soThat,
          },
        });

        const acMatch = body.match(/(?:given|ac:?)\s*([\s\S]+?)(?=(?:given|when|ac:?)|$)/gi);
        if (acMatch && acMatch.length > 0) {
          const given = acMatch[0]?.trim().slice(0, 500) ?? "Context";
          const whenMatch = body.match(/when\s*([\s\S]+?)(?=then|$)/i);
          const when = whenMatch?.[1]?.trim().slice(0, 500) ?? "Action";
          const thenMatch = body.match(/then\s*([\s\S]+?)(?=given|when|$)/i);
          const then = thenMatch?.[1]?.trim().slice(0, 500) ?? "Outcome";
          await db.acceptanceCriteria.create({
            data: {
              storyId: story.id,
              sortOrder: 0,
              given,
              when,
              then,
            },
          });
        }

        await db.storyExport.create({
          data: {
            storyId: story.id,
            packVersionId: version.id,
            packId: pack.id,
            workspaceId: ctx.workspaceId,
            externalSystem: "jira",
            externalId: issue.key,
            externalUrl: `${client.siteUrl}/browse/${issue.key}`,
          },
        });
      }

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "pack.create",
        entityType: "Pack",
        entityId: pack.id,
        metadata: { type: "jira_import", projectId: input.projectId, storiesImported: issues.length },
      });

      return { packId: pack.id, storiesImported: issues.length };
    }),

  jiraIssuesAsSources: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        jql: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getJiraClient(ctx.workspaceId);
      if (!client) throw new Error("Jira not connected");

      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new Error("Project not found");

      const issues = await searchJiraIssues(client, input.jql, [
        "summary",
        "description",
      ]);

      let imported = 0;
      for (let i = 0; i < issues.length; i += BATCH_SIZE) {
        const batch = issues.slice(i, i + BATCH_SIZE);
        for (const issue of batch) {
          const summary = (issue.fields as { summary?: string }).summary ?? issue.key;
          const desc = (issue.fields as { description?: unknown }).description;
          let content = summary;
          if (desc) {
            content += "\n\n" + atlassianStorageToPlainText(desc);
          }
          const source = await db.source.create({
            data: {
              workspaceId: ctx.workspaceId,
              projectId: input.projectId,
              type: SourceType.OTHER,
              name: summary.slice(0, 255),
              content: content.slice(0, 100_000),
              metadata: { jiraKey: issue.key },
              status: "completed",
            },
          });
          imported++;
          await inngest.send({
            name: "source/chunk-and-embed",
            data: {
              sourceId: source.id,
              workspaceId: ctx.workspaceId,
              projectId: input.projectId,
            },
          });
        }
      }

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "source.create",
        entityType: "Source",
        entityId: "import",
        metadata: { type: "jira_import_sources", projectId: input.projectId, count: imported },
      });

      return { sourcesImported: imported };
    }),

  confluencePages: workspaceProcedure
    .input(
      z.object({
        projectId: z.string(),
        pageIds: z.array(z.string()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getJiraClient(ctx.workspaceId);
      if (!client) throw new Error("Jira/Confluence not connected");

      const project = await db.project.findFirst({
        where: { id: input.projectId, workspaceId: ctx.workspaceId },
      });
      if (!project) throw new Error("Project not found");

      let imported = 0;
      for (const pageId of input.pageIds) {
        const page = await fetchConfluencePage(client, pageId);
        if (!page || !page.body) continue;

        const source = await db.source.create({
          data: {
            workspaceId: ctx.workspaceId,
            projectId: input.projectId,
            type: SourceType.OTHER,
            name: page.title.slice(0, 255),
            content: page.body.slice(0, 100_000),
            metadata: {
              confluencePageId: pageId,
              spaceKey: page.spaceKey,
              lastModified: page.lastModified,
            },
            status: "completed",
          },
        });
        imported++;
        await inngest.send({
          name: "source/chunk-and-embed",
          data: {
            sourceId: source.id,
            workspaceId: ctx.workspaceId,
            projectId: input.projectId,
          },
        });
      }

      await auditService.log({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        action: "source.create",
        entityType: "Source",
        entityId: "import",
        metadata: { type: "confluence_import", projectId: input.projectId, count: imported },
      });

      return { sourcesImported: imported };
    }),

  jiraPreview: workspaceProcedure
    .input(z.object({ jql: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const client = await getJiraClient(ctx.workspaceId);
      if (!client) return { count: 0, connected: false };
      const issues = await searchJiraIssues(client, input.jql, ["summary"]);
      return { count: issues.length, connected: true };
    }),

  confluenceSpaces: workspaceProcedure.query(async ({ ctx }) => {
    const client = await getJiraClient(ctx.workspaceId);
    if (!client) return { spaces: [], connected: false };
    const spaces = await fetchConfluenceSpaces(client);
    return { spaces, connected: true };
  }),

  confluenceSearch: workspaceProcedure
    .input(
      z.object({
        spaceKey: z.string(),
        query: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const client = await getJiraClient(ctx.workspaceId);
      if (!client) return { pages: [] };
      const pages = await searchConfluencePages(client, input.spaceKey, input.query);
      return { pages };
    }),
});
