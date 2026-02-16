import "@testing-library/jest-dom";

// Minimal env for tests that import modules using env validation
if (typeof process !== "undefined") {
  process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
  process.env.CLERK_SECRET_KEY ??= "sk_test_placeholder";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= "pk_test_placeholder";
  process.env.ANTHROPIC_API_KEY ??= "sk-ant-placeholder";
  process.env.OPENAI_API_KEY ??= "sk-placeholder";
  process.env.R2_ACCOUNT_ID ??= "test";
  process.env.R2_ACCESS_KEY_ID ??= "test";
  process.env.R2_SECRET_ACCESS_KEY ??= "test";
  process.env.R2_ENDPOINT ??= "https://test.r2.cloudflarestorage.com";
  process.env.INNGEST_SIGNING_KEY ??= "signkey-test-placeholder";
}
