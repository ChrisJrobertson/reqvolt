import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { db } from "../db";

const MIN_QUERY_LENGTH = 2;

function sanitiseQuery(q: string): string {
  const trimmed = q.trim();
  return trimmed.replace(/[%_\\]/g, (c) => `\\${c}`);
}

export type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  type: "pack" | "story" | "source" | "project";
  href: string;
  icon?: string;
};

export const searchRouter = router({
  global: workspaceProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (q.length < MIN_QUERY_LENGTH) return [];

      const sanitised = sanitiseQuery(q);
      const contains = { contains: sanitised, mode: "insensitive" as const };
      const limit = input.limit;

      const [packs, stories, sources, projects] = await Promise.all([
        db.pack.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            name: contains,
          },
          take: limit,
          select: {
            id: true,
            name: true,
            projectId: true,
            project: { select: { name: true } },
          },
        }),
        db.story.findMany({
          where: {
            deletedAt: null,
            packVersion: {
              pack: { workspaceId: ctx.workspaceId },
            },
            OR: [
              { persona: contains },
              { want: contains },
              { soThat: contains },
            ],
          },
          take: limit,
          select: {
            id: true,
            persona: true,
            want: true,
            soThat: true,
            packVersion: {
              select: {
                pack: {
                  select: {
                    id: true,
                    projectId: true,
                    project: { select: { name: true } },
                  },
                },
              },
            },
          },
        }),
        db.source.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            deletedAt: null,
            OR: [{ name: contains }, { content: contains }],
          },
          take: limit,
          select: {
            id: true,
            name: true,
            projectId: true,
            project: { select: { name: true } },
          },
        }),
        db.project.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            name: contains,
          },
          take: limit,
          select: {
            id: true,
            name: true,
          },
        }),
      ]);

      const results: SearchResult[] = [];

      for (const p of packs) {
        results.push({
          id: p.id,
          title: p.name,
          subtitle: `Pack in ${p.project.name}`,
          type: "pack",
          href: `/workspace/${ctx.workspaceId}/projects/${p.projectId}/packs/${p.id}`,
          icon: "Package",
        });
      }

      for (const s of stories) {
        const title = `${s.persona} — ${s.want}`.slice(0, 80);
        const pack = s.packVersion.pack;
        results.push({
          id: s.id,
          title: title + (title.length >= 80 ? "…" : ""),
          subtitle: `Story in ${pack.project.name}`,
          type: "story",
          href: `/workspace/${ctx.workspaceId}/projects/${pack.projectId}/packs/${pack.id}?story=${s.id}`,
          icon: "FileText",
        });
      }

      for (const s of sources) {
        results.push({
          id: s.id,
          title: s.name,
          subtitle: `Source in ${s.project.name}`,
          type: "source",
          href: `/workspace/${ctx.workspaceId}/projects/${s.projectId}`,
          icon: "Database",
        });
      }

      for (const p of projects) {
        results.push({
          id: p.id,
          title: p.name,
          subtitle: "Project",
          type: "project",
          href: `/workspace/${ctx.workspaceId}/projects/${p.id}`,
          icon: "FolderOpen",
        });
      }

      const qLower = q.toLowerCase();
      results.sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        const aExact = aTitle === qLower ? 3 : aTitle.startsWith(qLower) ? 2 : 1;
        const bExact = bTitle === qLower ? 3 : bTitle.startsWith(qLower) ? 2 : 1;
        if (aExact !== bExact) return bExact - aExact;
        const typeOrder = { project: 0, pack: 1, story: 2, source: 3 };
        return (typeOrder[a.type] ?? 0) - (typeOrder[b.type] ?? 0);
      });

      return results.slice(0, limit);
    }),
});
