/**
 * Zod-validated environment variables.
 * Required vars throw on missing. Optional vars default to undefined.
 */
import { z } from "zod";

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-20250514"),
  CLAUDE_MODEL_LIGHT: z.string().default("claude-haiku-4-5-20251001"),
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET_NAME: z.string().default("reqvolt-files"),
  R2_ENDPOINT: z.string().min(1, "R2_ENDPOINT is required"),
  R2_REGION: z.string().default("auto"),
  INNGEST_SIGNING_KEY: z.string().min(1, "INNGEST_SIGNING_KEY is required"),
  INNGEST_EVENT_KEY: z.string().optional(),
  LLM_RATE_LIMIT_RPM: z.coerce.number().default(10),
  LLM_TOKEN_BUDGET_MONTHLY: z.coerce.number().default(500000),

  // Optional - app starts without these
  REDIS_URL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().default("https://cloud.langfuse.com"),
  MONDAY_API_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables. Check .env.local");
}

export const env = parsed.data;
