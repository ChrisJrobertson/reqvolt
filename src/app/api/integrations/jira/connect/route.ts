/**
 * Initiate Jira OAuth 2.0 flow.
 * Requires Admin role. Redirects to Atlassian authorize URL.
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { SignJWT } from "jose";

const SCOPES = "read:jira-work write:jira-work offline_access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId },
  });
  if (!member || member.role !== "Admin") {
    return NextResponse.redirect(
      new URL(`/workspace/${workspaceId}/settings?error=forbidden`, request.url)
    );
  }

  const clientId = env.JIRA_CLIENT_ID;
  const redirectUri = env.JIRA_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(
      new URL(`/workspace/${workspaceId}/settings?error=config`, request.url)
    );
  }

  const stateSecret = env.JIRA_OAUTH_STATE_SECRET ?? env.CLERK_SECRET_KEY;
  const state = await new SignJWT({
    workspaceId,
    userId,
    nonce: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(stateSecret));

  const authorizeUrl = new URL("https://auth.atlassian.com/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authorizeUrl.toString());
}
