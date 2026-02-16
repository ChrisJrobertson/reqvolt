/**
 * Langfuse client - conditionally initialised when env vars exist.
 * NEVER log source text or prompt content - metadata only for cost monitoring.
 */
import { Langfuse } from "langfuse";
import { env } from "@/lib/env";

let _langfuse: Langfuse | null = null;

export function getLangfuse(): Langfuse | null {
  if (_langfuse) return _langfuse;
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  _langfuse = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: env.LANGFUSE_HOST,
  });
  return _langfuse;
}

export async function traceLlmCall<T>(params: {
  name: string;
  metadata: {
    model: string;
    workspaceId?: string;
    packId?: string;
    cacheHit?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
  };
  fn: () => Promise<T>;
}): Promise<T> {
  const langfuse = getLangfuse();
  if (!langfuse) return params.fn();

  const trace = langfuse.trace({
    name: params.name,
    metadata: params.metadata,
  });

  const start = Date.now();
  try {
    const result = await params.fn();
    trace.update({
      metadata: {
        ...params.metadata,
        latencyMs: Date.now() - start,
      },
    });
    return result;
  } catch (err) {
    trace.update({
      metadata: {
        ...params.metadata,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}
