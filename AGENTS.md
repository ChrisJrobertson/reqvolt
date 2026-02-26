# Reqvolt

See `CLAUDE.md` for full project context, architecture, commands, project structure, coding standards, and git conventions.

## Cursor Cloud specific instructions

### Services overview

Reqvolt is a single Next.js 15 application (no monorepo, no Docker). All infrastructure (DB, auth, AI, file storage, background jobs) is cloud-hosted.

- **Dev server:** `pnpm dev` (port 3000)
- **Lint:** `pnpm lint`
- **Typecheck:** `pnpm typecheck`
- **Unit tests:** `pnpm test` (Vitest, 6 test files)
- **E2E tests:** `pnpm test:e2e` (Playwright — requires running dev server + real Clerk/DB credentials)
- **Full verify:** `pnpm verify` (lint + typecheck + test + build)

### Environment variables

Copy `.env.example` to `.env.local`. The Zod validation in `src/lib/env.ts` only **warns** in development mode (does not throw), so the dev server starts with placeholder values. Production mode throws on missing required vars.

Required external services for full functionality: Neon PostgreSQL, Clerk, Anthropic API, OpenAI API, Cloudflare R2, Inngest. Optional (graceful fallback): Upstash Redis, Resend, SendGrid, Sentry, Langfuse, Jira, Monday.com.

### Gotchas

- **pnpm build scripts:** The project uses `pnpm.onlyBuiltDependencies` in `package.json` to allowlist native build scripts (Prisma, esbuild, Sentry CLI, etc.). Without this, `pnpm install` skips postinstall scripts and Prisma client generation fails.
- **Prisma client generation:** Happens automatically via `@prisma/client` postinstall hook during `pnpm install`. No separate `prisma generate` step is needed unless you modify the schema. The `pnpm build` script also runs `prisma generate` before `next build`.
- **Sentry wrapping:** `next.config.ts` conditionally wraps with `@sentry/nextjs` only when `SENTRY_DSN` is set. Without it, the config is plain Next.js.
- **Database migrations:** `pnpm db:migrate` requires a real `DATABASE_URL` pointing to a Neon PostgreSQL instance. Schema uses `pgvector` extension and `Unsupported("vector(1536)")` column type.
