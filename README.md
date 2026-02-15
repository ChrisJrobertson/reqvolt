# Reqvolt

AI-powered Story Packs for agile teams. Converts messy discovery inputs into evidence-linked stories with testable acceptance criteria.

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

**Required for local development:**

- `DATABASE_URL` - Neon PostgreSQL connection string
- `CLERK_SECRET_KEY` - From [Clerk Dashboard](https://dashboard.clerk.com)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - From Clerk Dashboard
- `ANTHROPIC_API_KEY` - For pack generation
- `OPENAI_API_KEY` - For embeddings
- `R2_*` - Cloudflare R2 for file uploads
- `INNGEST_SIGNING_KEY` - For background jobs

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Start development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

- `src/app/` - Next.js App Router pages
- `src/server/routers/` - tRPC API routes
- `src/server/services/` - Business logic
- `prisma/` - Database schema and migrations

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm verify` | Lint + typecheck + test + build |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:studio` | Open Prisma Studio |

## Features Implemented

- **Auth & Workspaces**: Clerk magic link, auto-create workspace, projects
- **Source Ingestion**: Paste text/email, upload PDF/DOCX via presigned R2 URLs
- **RAG Pipeline**: Chunking, OpenAI embeddings, pgvector retrieval
- **Pack Generation**: AI-generated Story Packs with evidence linking
- **Pack Editor**: Three-panel layout (nav, content, evidence), evidence badges, unsupported flags
- **Regeneration**: New version with source/notes selection, version selector

## Architecture

- **Tenant isolation**: `workspaceId` via `x-workspace-id` header
- **API**: tRPC only (no Server Actions)
- **File uploads**: Presigned URLs to Cloudflare R2
- **Database**: Neon PostgreSQL with pgvector
