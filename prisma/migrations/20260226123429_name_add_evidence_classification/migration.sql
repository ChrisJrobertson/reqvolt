-- CreateEnum
CREATE TYPE "StoryRating" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "PackRating" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QARuleCode" ADD VALUE 'NO_EVIDENCE';
ALTER TYPE "QARuleCode" ADD VALUE 'WEAK_EVIDENCE_ONLY';
ALTER TYPE "QARuleCode" ADD VALUE 'SEMANTIC_DUPLICATE';
ALTER TYPE "QARuleCode" ADD VALUE 'LONG_STORY';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "notifyMentions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReplies" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PackVersion" ADD COLUMN     "confidenceLevel" TEXT,
ADD COLUMN     "confidenceScore" INTEGER,
ADD COLUMN     "generationConfidence" JSONB,
ADD COLUMN     "selfReviewPassed" BOOLEAN,
ADD COLUMN     "selfReviewRun" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "aiEmbeddingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aiGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aiQaAutoFixEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aiSelfReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "aiTopicExtractionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StoryFeedback" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "StoryRating" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackFeedback" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" "PackRating" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "packId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryComment" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "packVersionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "mentions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" VARCHAR(255) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryFeedback_packId_idx" ON "StoryFeedback"("packId");

-- CreateIndex
CREATE INDEX "StoryFeedback_workspaceId_createdAt_idx" ON "StoryFeedback"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryFeedback_storyId_userId_key" ON "StoryFeedback"("storyId", "userId");

-- CreateIndex
CREATE INDEX "PackFeedback_workspaceId_createdAt_idx" ON "PackFeedback"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackFeedback_packId_userId_key" ON "PackFeedback"("packId", "userId");

-- CreateIndex
CREATE INDEX "ModelUsage_workspaceId_createdAt_idx" ON "ModelUsage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelUsage_task_createdAt_idx" ON "ModelUsage"("task", "createdAt");

-- CreateIndex
CREATE INDEX "StoryComment_storyId_idx" ON "StoryComment"("storyId");

-- CreateIndex
CREATE INDEX "StoryComment_workspaceId_idx" ON "StoryComment"("workspaceId");

-- CreateIndex
CREATE INDEX "StoryComment_parentId_idx" ON "StoryComment"("parentId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryFeedback_storyExportId_isResolved_idx" ON "DeliveryFeedback"("storyExportId", "isResolved");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Source_projectId_deletedAt_idx" ON "Source"("projectId", "deletedAt");

-- CreateIndex
CREATE INDEX "SourceChangeImpact_packId_isAcknowledged_idx" ON "SourceChangeImpact"("packId", "isAcknowledged");

-- CreateIndex
CREATE INDEX "StoryExport_packVersionId_externalSystem_idx" ON "StoryExport"("packVersionId", "externalSystem");

-- AddForeignKey
ALTER TABLE "StoryFeedback" ADD CONSTRAINT "StoryFeedback_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryFeedback" ADD CONSTRAINT "StoryFeedback_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryFeedback" ADD CONSTRAINT "StoryFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackFeedback" ADD CONSTRAINT "PackFeedback_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackFeedback" ADD CONSTRAINT "PackFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryComment" ADD CONSTRAINT "StoryComment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryComment" ADD CONSTRAINT "StoryComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StoryComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
