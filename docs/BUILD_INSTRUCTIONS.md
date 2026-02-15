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
