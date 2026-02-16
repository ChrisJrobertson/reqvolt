/**
 * Jira Cloud API client. OAuth 2.0 tokens, refresh, search, update.
 */
import { db } from "../db";
import { env } from "@/lib/env";

const TOKEN_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

export interface JiraIssue {
  key: string;
  fields: {
    status?: { name: string };
    comment?: { comments?: Array<{ id: string; body?: { content?: unknown }; created?: string; author?: { displayName?: string } }> };
  };
}

export interface JiraClient {
  cloudId: string;
  siteUrl: string;
  accessToken: string;
}

async function refreshJiraToken(connectionId: string): Promise<void> {
  const conn = await db.jiraConnection.findUnique({
    where: { id: connectionId },
  });
  if (!conn) throw new Error("Jira connection not found");

  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env.JIRA_CLIENT_ID,
      client_secret: env.JIRA_CLIENT_SECRET,
      refresh_token: conn.refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    await db.jiraConnection.update({
      where: { id: connectionId },
      data: { isActive: false, syncError: `Token refresh failed: ${err.slice(0, 200)}` },
    });
    throw new Error("Jira token refresh failed");
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  await db.jiraConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? conn.refreshToken,
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      syncError: null,
    },
  });
}

export async function getJiraClient(workspaceId: string): Promise<JiraClient | null> {
  const conn = await db.jiraConnection.findFirst({
    where: { workspaceId, isActive: true },
  });
  if (!conn) return null;

  const needsRefresh = conn.tokenExpiresAt.getTime() - Date.now() < TOKEN_BUFFER_MS;
  if (needsRefresh) {
    try {
      await refreshJiraToken(conn.id);
      const updated = await db.jiraConnection.findUnique({
        where: { id: conn.id },
      });
      if (!updated) return null;
      return {
        cloudId: updated.cloudId,
        siteUrl: updated.siteUrl,
        accessToken: updated.accessToken,
      };
    } catch {
      return null;
    }
  }

  return {
    cloudId: conn.cloudId,
    siteUrl: conn.siteUrl,
    accessToken: conn.accessToken,
  };
}

export async function searchJiraIssues(
  client: JiraClient,
  jql: string,
  fields: string[] = ["status", "comment"]
): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let startAt = 0;
  const maxResults = 50;

  while (true) {
    const res = await fetch(
      `https://api.atlassian.com/ex/jira/${client.cloudId}/rest/api/3/search?` +
        new URLSearchParams({
          jql,
          startAt: String(startAt),
          maxResults: String(maxResults),
          fields: fields.join(","),
        }),
      {
        headers: {
          Authorization: `Bearer ${client.accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (res.status === 401) throw new Error("Jira 401 Unauthorized");
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      throw new Error(`Jira 429 Rate limited${retryAfter ? `, retry after ${retryAfter}s` : ""}`);
    }
    if (!res.ok) throw new Error(`Jira API error: ${res.status}`);

    const data = (await res.json()) as { issues: JiraIssue[] };
    issues.push(...(data.issues ?? []));
    if (data.issues.length < maxResults) break;
    startAt += maxResults;
  }

  return issues;
}

export async function updateJiraIssue(
  client: JiraClient,
  issueKey: string,
  fields: { summary?: string; description?: { type: string; version: number; content: unknown[] } }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (fields.summary) body.summary = fields.summary;
  if (fields.description) body.description = fields.description;

  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${client.cloudId}/rest/api/3/issue/${issueKey}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${client.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields: body }),
    }
  );

  if (res.status === 401) throw new Error("Jira 401 Unauthorized");
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(`Jira 429 Rate limited${retryAfter ? `, retry after ${retryAfter}s` : ""}`);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jira update failed: ${err.slice(0, 200)}`);
  }
}

export async function createJiraIssue(
  client: JiraClient,
  projectKey: string,
  fields: { summary: string; description?: { type: string; version: number; content: unknown[] }; issuetype?: { id: string } }
): Promise<{ key: string; url: string }> {
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${client.cloudId}/rest/api/3/issue`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${client.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          summary: fields.summary,
          description: fields.description,
          issuetype: fields.issuetype ?? { name: "Story" },
        },
      }),
    }
  );

  if (res.status === 401) throw new Error("Jira 401 Unauthorized");
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new Error(`Jira 429 Rate limited${retryAfter ? `, retry after ${retryAfter}s` : ""}`);
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jira create failed: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { key: string };
  return {
    key: data.key,
    url: `${client.siteUrl}/browse/${data.key}`,
  };
}

export async function disconnectJira(workspaceId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.jiraConnection.deleteMany({ where: { workspaceId } });
    await tx.storyExport.updateMany({
      where: { workspaceId, externalSystem: "jira" },
      data: { syncError: "Jira disconnected" },
    });
  });
}
