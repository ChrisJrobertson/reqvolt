# Reqvolt
## What
SaaS platform for agile teams. Converts messy discovery inputs (meeting notes,
emails, documents, customer feedback, workshop outputs) into evidence-linked
Story Packs with testable acceptance criteria, QA quality gates, stakeholder
review workflows, and one-click push to Monday.com.
## Target Users
Product Owners, Product Managers, Business Analysts, Scrum Masters, and anyone
responsible for backlog quality in agile teams.
## Architecture Decisions
- Tenant isolation: workspaceId via x-workspace-id header, validated in tRPC middleware
- Mutations: tRPC ONLY (no Server Actions anywhere)
- File uploads: presigned PUT URLs to Cloudflare R2 (never through app server)
- Database: Neon serverless Postgres for all environments (no local Docker DB)
- Background jobs: Inngest (serve endpoint must export dynamic = 'force-dynamic')
- Observability: Sentry + Langfuse (conditional init, app starts without them)
- PII: NEVER log source content, emails, or file contents to observability tools
## Tech Stack
- Framework: Next.js 15, App Router, TypeScript strict mode
- Database: PostgreSQL 16 on Neon (serverless) with pgvector extension
- ORM: Prisma 6
- Auth: Clerk (magic link, workspace-scoped)
- AI: Anthropic Claude API (primary), OpenAI GPT-4o (fallback + embeddings)
- State: Zustand for client state
- Styling: Tailwind CSS 4 + shadcn/ui
- API: tRPC with Zod validation (queries AND mutations)
- Deployment: Vercel (preview + production)
- File Storage: Cloudflare R2 via presigned URLs (S3 API, endpoint from R2_ENDPOINT env var)
- Caching: Upstash Redis (optional locally, graceful fallback)
- Background Jobs: Inngest
- Observability: Sentry (errors) + Langfuse (LLM tracing) - conditional init
## Commands
pnpm dev # Dev server (localhost:3000)
pnpm build # Production build
pnpm lint # ESLint
pnpm typecheck # TypeScript strict check
pnpm test # Vitest unit tests
pnpm test:e2e # Playwright E2E tests
pnpm verify # lint + typecheck + test + build (run before every commit)
pnpm db:migrate # npx prisma migrate dev
pnpm db:seed # npx prisma db seed
pnpm db:studio # npx prisma studio
## Project Structure
src/app/ > Next.js App Router pages and layouts
src/app/(dashboard)/ > Authenticated routes: /workspace/[workspaceId]/...
src/app/api/trpc/ > tRPC route handler
src/app/api/inngest/ > Inngest serve endpoint (force-dynamic)
src/server/routers/ > tRPC router definitions (one per domain)
src/server/services/ > Business logic (generation, QA, export, RAG, audit)
src/server/integrations/ > External API clients (Monday.com - Phase 3)
src/server/db/ > Prisma client singleton
src/server/prompts/ > Versioned LLM prompt templates
src/server/cache/ > Redis cache service (graceful fallback)
src/server/middleware/ > Auth, workspace resolution, rate limiting
src/components/ > Shared UI components (shadcn/ui wrappers)
src/components/pack-editor/ > Pack editor components
src/lib/ > Utilities (chunking, embedding, diff, validation, env)
src/lib/env.ts > Zod-validated env vars (fail fast on missing keys)
src/stores/ > Zustand stores
prisma/ > Schema, migrations, seed.ts
tests/ > Mirror of src/ structure
## Detailed Documentation
Read the relevant file BEFORE working on that area:
- docs/SPEC.md > Full specification (executive summary, epics, NFR)
- docs/DATA_MODEL.md > All database tables, relationships, indexes
- docs/PROMPT_STRATEGY.md > LLM prompt architecture (sections 15.1-15.9)
- docs/USER_FLOWS.md > All user flows (flows 1-5a)
- docs/PHASE_PLAN.md > Phased build plan with story assignments
- docs/UI_LAYOUTS.md > Screen-by-screen layout specifications
- docs/STORIES.md > All user stories with acceptance criteria
- docs/BUILD_INSTRUCTIONS.md > Project init, coding standards, testing, env vars
- docs/INTEGRATIONS.md > Monday.com API setup, field mapping, OAuth flow
## Coding Standards
- TypeScript strict mode; no `any` types except explicitly typed escape hatches
- All tRPC routes must have Zod input validation
- ALL database queries MUST be scoped to workspaceId (tenant isolation)
- Error boundaries on all page-level components
- Structured logging: { timestamp, level, workspaceId, userId, action }
- UK English in all user-facing strings and comments
- All create/update/delete/share actions must write to AuditLog
- Optimistic locking check on PackVersion before save
- Functional React components with hooks only
- tRPC for ALL server communication (queries AND mutations - no Server Actions)
- Every new API route needs a happy-path test and an error test
- When generating files, ALWAYS read the relevant docs/ file first
## Git Conventions
- Branch: phase-N/story-SX.Y-short-description
- Commit: feat(S2.1): implement pack generation endpoint
- Always run pnpm verify before committing
