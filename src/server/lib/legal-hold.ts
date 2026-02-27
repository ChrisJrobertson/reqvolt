import { TRPCError } from "@trpc/server";
import { db } from "../db";

const LEGAL_HOLD_MESSAGE =
  "This project is under legal hold. Deletion and modification of sources and baselines is restricted.";

export async function assertNoLegalHold(projectId: string): Promise<void> {
  const project = await db.project.findFirst({
    where: { id: projectId },
    select: { legalHold: true },
  });
  if (project?.legalHold) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: LEGAL_HOLD_MESSAGE,
    });
  }
}

export async function assertNoLegalHoldForSource(sourceId: string): Promise<void> {
  const source = await db.source.findFirst({
    where: { id: sourceId },
    select: { projectId: true },
  });
  if (source) await assertNoLegalHold(source.projectId);
}

export async function assertNoLegalHoldForChunk(chunkId: string): Promise<void> {
  const chunk = await db.sourceChunk.findFirst({
    where: { id: chunkId },
    include: { source: { select: { projectId: true } } },
  });
  if (chunk) await assertNoLegalHold(chunk.source.projectId);
}
