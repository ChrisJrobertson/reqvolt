# Build Instructions

## Project Initialisation
1. Node.js 20, pnpm 9+
2. Clone repo, run `pnpm install`
3. Copy `.env.example` to `.env.local`, fill required vars
4. Run `pnpm db:migrate` for schema
5. Run `pnpm db:seed` for test data (optional)
6. Run `pnpm dev` for local development

## Coding Standards
- TypeScript strict mode; no `any` types
- All tRPC routes: Zod input validation
- ALL database queries: scoped to workspaceId
- Error boundaries on page-level components
- Structured logging: { timestamp, level, workspaceId, userId, action }
- UK English in user-facing strings
- AuditLog on create/update/delete/share
- tRPC for ALL server communication (no Server Actions)

## Testing
- Unit tests: Vitest
- E2E tests: Playwright
- Run `pnpm verify` before every commit

## Environment Variables
See `.env.example` for full list. Required vars throw on missing. Optional vars (REDIS_URL, SENTRY_DSN, LANGFUSE_*, MONDAY_API_TOKEN) default to undefined.

## Production Deployment (Vercel)

Add these environment variables in **Vercel → Project → Settings → Environment Variables** (for Production, Preview, or both):

**Required:**
- `DATABASE_URL` — Neon connection string (pooler)
- `DIRECT_URL` — Neon direct connection (optional but recommended)
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `INNGEST_SIGNING_KEY` — from Inngest dashboard

**Clerk keys for preview deployments:** Production keys (`pk_live_`, `sk_live_`) are domain-locked to `reqvolt.com`. For Vercel preview deployments (`*.vercel.app`), use development keys (`pk_test_`, `sk_test_`) in the **Preview** and **Development** environments. Set production keys only for the **Production** environment.

**Clerk redirects (optional):** `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard`

**Optional:** `ADMIN_USER_IDS`, `REDIS_URL`, `RESEND_API_KEY`, `SENTRY_DSN`, etc. (see `.env.example`)

**Runtime validation:** On first tRPC or Inngest request in production, if any required var is missing, the app throws with a clear error listing the missing vars.
