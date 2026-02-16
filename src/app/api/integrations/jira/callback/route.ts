/**
 * Jira OAuth 2.0 callback. Exchange code for tokens, get cloudId, create JiraConnection.
 */
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { auditService } from "@/server/services/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    const base = new URL(request.url).origin;
    return NextResponse.redirect(
      `${base}/dashboard?error=jira_oauth_${errorParam}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard?error=jira_oauth_missing_params", request.url)
    );
  }

  const stateSecret = env.JIRA_OAUTH_STATE_SECRET ?? env.CLERK_SECRET_KEY;
  let payload: { workspaceId: string; userId: string; nonce: string };
  try {
    const { payload: p } = await jwtVerify(
      state,
      new TextEncoder().encode(stateSecret)
    );
    payload = p as { workspaceId: string; userId: string; nonce: string };
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard?error=jira_oauth_invalid_state", request.url)
    );
  }

  const { workspaceId, userId } = payload;
  const clientId = env.JIRA_CLIENT_ID;
  const clientSecret = env.JIRA_CLIENT_SECRET;
  const redirectUri = env.JIRA_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(
      new URL(`/workspace/${workspaceId}/settings?error=jira_config`, request.url)
    );
  }

  const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[jira-oauth] Token exchange failed:", err);
    return NextResponse.redirect(
      new URL(`/workspace/${workspaceId}/settings?error=jira_token`, request.url)
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const resourcesRes = await fetch(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );

  if (!resourcesRes.ok) {
    console.error("[jira-oauth] Accessible resources failed");
    return NextResponse.redirect(
      new URL(`/workspace/${workspaceId}/settings?error=jira_resources`, request.url)
    );
  }

  const resources = (await resourcesRes.json()) as Array<{
    id: string;
    url: string;
    name: string;
  }>;

  if (resources.length === 0) {
    return NextResponse.redirect(
      new URL(`/workspace/${workspaceId}/settings?error=jira_no_sites`, request.url)
    );
  }

  const site = resources[0]!;
  const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await db.$transaction(async (tx) => {
    await tx.jiraConnection.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        cloudId: site.id,
        siteUrl: site.url.replace(/\/$/, ""),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        scopes: "read:jira-work write:jira-work offline_access",
        isActive: true,
      },
      update: {
        cloudId: site.id,
        siteUrl: site.url.replace(/\/$/, ""),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        scopes: "read:jira-work write:jira-work offline_access",
        isActive: true,
        syncError: null,
      },
    });
  });

  await auditService.log({
    workspaceId,
    userId,
    action: "jira.connect",
    entityType: "JiraConnection",
    metadata: { siteUrl: site.url },
  });

  return NextResponse.redirect(
    new URL(`/workspace/${workspaceId}/settings?jira=connected`, request.url)
  );
}
