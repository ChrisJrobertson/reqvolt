# Reqvolt

AI-powered Story Packs for agile teams. Converts messy discovery inputs into evidence-linked stories with testable acceptance criteria.

## Prerequisites

- Node.js 20.19+
- pnpm
- Neon PostgreSQL database

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

See `.env.example` for all variables. Required: `DATABASE_URL`, Clerk keys, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, R2 config, `INNGEST_SIGNING_KEY`.

### 3. Run database migrations

```bash
pnpm db:migrate
pnpm db:seed
```

### 4. Start development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

Next.js 15 App Router, tRPC API, Prisma + Neon PostgreSQL, Clerk auth, Inngest background jobs. Tenant isolation via `workspaceId`.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server |
| `pnpm build` | Production build |
| `pnpm verify` | Lint + typecheck + test + build |
| `pnpm test` | Run unit tests |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:studio` | Open Prisma Studio |

## Deployment

See `docs/DEPLOYMENT.md` for Vercel deployment instructions.
