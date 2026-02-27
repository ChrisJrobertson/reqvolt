-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "packVersionId" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "approvalRef" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Baseline_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Pack" ADD COLUMN "lastBaselineId" TEXT,
ADD COLUMN "divergedFromBaseline" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Baseline_packId_idx" ON "Baseline"("packId");

-- CreateIndex
CREATE INDEX "Baseline_workspaceId_idx" ON "Baseline"("workspaceId");

-- AddForeignKey
ALTER TABLE "Baseline" ADD CONSTRAINT "Baseline_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Baseline" ADD CONSTRAINT "Baseline_packVersionId_fkey" FOREIGN KEY ("packVersionId") REFERENCES "PackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_lastBaselineId_fkey" FOREIGN KEY ("lastBaselineId") REFERENCES "Baseline"("id") ON DELETE SET NULL ON UPDATE CASCADE;
