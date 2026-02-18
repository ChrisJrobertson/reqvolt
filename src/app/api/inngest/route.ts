import { assertEnvValid } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getHandler() {
  const { handler } = await import("./inngest-handler");
  return handler;
}

export async function GET(req: Request, ctx: unknown) {
  assertEnvValid();
  const handler = await getHandler();
  return handler.GET(req as Parameters<typeof handler.GET>[0], ctx);
}
export async function POST(req: Request, ctx: unknown) {
  assertEnvValid();
  const handler = await getHandler();
  return handler.POST(req as Parameters<typeof handler.POST>[0], ctx);
}
export async function PUT(req: Request, ctx: unknown) {
  assertEnvValid();
  const handler = await getHandler();
  return handler.PUT(req as Parameters<typeof handler.PUT>[0], ctx);
}
