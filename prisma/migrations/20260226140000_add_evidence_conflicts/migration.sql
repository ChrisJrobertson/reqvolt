-- CreateEnum
CREATE TYPE "ConflictResolution" AS ENUM ('unresolved', 'source_a_preferred', 'source_b_preferred', 'both_valid', 'dismissed');

-- CreateTable
CREATE TABLE "EvidenceConflict" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chunkAId" TEXT NOT NULL,
    "chunkBId" TEXT NOT NULL,
    "conflictSummary" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "resolution" "ConflictResolution",
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceConflict_projectId_idx" ON "EvidenceConflict"("projectId");

-- CreateIndex
CREATE INDEX "EvidenceConflict_workspaceId_idx" ON "EvidenceConflict"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceConflict_chunkAId_chunkBId_key" ON "EvidenceConflict"("chunkAId", "chunkBId");

-- AddForeignKey
ALTER TABLE "EvidenceConflict" ADD CONSTRAINT "EvidenceConflict_chunkAId_fkey" FOREIGN KEY ("chunkAId") REFERENCES "SourceChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceConflict" ADD CONSTRAINT "EvidenceConflict_chunkBId_fkey" FOREIGN KEY ("chunkBId") REFERENCES "SourceChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceConflict" ADD CONSTRAINT "EvidenceConflict_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
