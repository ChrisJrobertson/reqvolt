/**
 * Zod-validated environment variables.
 * Server vars validated on server; client vars on client.
 * Throw on missing required in production; warn in development.
 */
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const serverSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_ENDPOINT: z.string().min(1, "R2_ENDPOINT is required"),
  INNGEST_SIGNING_KEY: z.string().min(1, "INNGEST_SIGNING_KEY is required"),

  // Optional with defaults
  R2_BUCKET_NAME: z.string().default("reqvolt-files"),
  R2_REGION: z.string().default("auto"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-20250514"),
  CLAUDE_MODEL_LIGHT: z.string().default("claude-haiku-4-5-20251001"),
  CLAUDE_HAIKU_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  ADMIN_USER_IDS: z.string().optional(), // Comma-separated Clerk user IDs for admin quality dashboard
  LLM_RATE_LIMIT_RPM: z.coerce.number().default(10),
  LLM_TOKEN_BUDGET_MONTHLY: z.coerce.number().default(500000),
  EMAIL_FROM: z.string().default("Reqvolt <notifications@reqvolt.com>"),
  INBOUND_EMAIL_DOMAIN: z.string().default("ingest.reqvolt.com"),
  LANGFUSE_HOST: z.string().default("https://cloud.langfuse.com"),

  // Optional — graceful fallback when unset
  INNGEST_EVENT_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_WEBHOOK_SECRET: z.string().optional(),
  JIRA_CLIENT_ID: z.string().optional(),
  JIRA_CLIENT_SECRET: z.string().optional(),
  JIRA_REDIRECT_URI: z.string().optional(),
  JIRA_OAUTH_STATE_SECRET: z.string().optional(),
  MONDAY_API_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

function validateServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = `Invalid env: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`;
    if (isProd) throw new Error(msg);
    console.warn("[env] Server validation failed:", parsed.error.flatten().fieldErrors);
    throw new Error(msg);
  }
  return parsed.data;
}

function validateClientEnv() {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  if (!parsed.success) {
    const msg = `Invalid client env: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`;
    if (isProd) throw new Error(msg);
    console.warn("[env] Client validation failed:", parsed.error.flatten().fieldErrors);
    throw new Error(msg);
  }
  return parsed.data;
}

export const env = validateServerEnv();
export const clientEnv = validateClientEnv();
