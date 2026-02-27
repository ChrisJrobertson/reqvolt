-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('open', 'approved', 'rejected', 'implemented');

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "trigger" VARCHAR(500) NOT NULL,
    "triggerSourceId" TEXT,
    "impactedStoryIds" JSONB NOT NULL,
    "impactSummary" TEXT NOT NULL,
    "requestedBy" VARCHAR(255) NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'open',
    "approvedBy" VARCHAR(255),
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeRequest_projectId_idx" ON "ChangeRequest"("projectId");

-- CreateIndex
CREATE INDEX "ChangeRequest_packId_idx" ON "ChangeRequest"("packId");

-- CreateIndex
CREATE INDEX "ChangeRequest_workspaceId_idx" ON "ChangeRequest"("workspaceId");

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
