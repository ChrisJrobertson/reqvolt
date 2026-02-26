/**
 * Auth helpers with optional dev bypass.
 * When SKIP_AUTH_IN_DEV=1 and NODE_ENV=development, returns a dev userId
 * so you can test without logging in.
 */
import { auth } from "@clerk/nextjs/server";

const SKIP_VALUES = ["1", "true", "yes"];

function isSkipAuthEnabled(): boolean {
  const val = process.env.SKIP_AUTH_IN_DEV;
  return (
    process.env.NODE_ENV === "development" &&
    val !== undefined &&
    SKIP_VALUES.includes(val.toLowerCase())
  );
}

function getDevUserId(): string {
  return (
    process.env.REQVOLT_DEV_USER_ID?.trim() || "dev-bypass-user"
  );
}

/**
 * Returns the effective userId for auth checks.
 * When SKIP_AUTH_IN_DEV is enabled, returns a dev userId instead of requiring Clerk login.
 */
export async function getAuthUserId(): Promise<string | null> {
  if (isSkipAuthEnabled()) {
    return getDevUserId();
  }
  const { userId } = await auth();
  return userId;
}
