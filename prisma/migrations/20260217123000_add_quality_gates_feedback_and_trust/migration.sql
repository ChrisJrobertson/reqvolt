-- CreateEnum
CREATE TYPE "StoryRating" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "PackRating" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- AlterTable
ALTER TABLE "Workspace"
ADD COLUMN "aiGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "aiQaAutoFixEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "aiSelfReviewEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "aiTopicExtractionEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "aiEmbeddingEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PackVersion"
ADD COLUMN "generationConfidence" JSONB,
ADD COLUMN "confidenceScore" INTEGER,
ADD COLUMN "confidenceLevel" TEXT,
ADD COLUMN "selfReviewRun" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "selfReviewPassed" BOOLEAN;

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

-- CreateIndex
CREATE UNIQUE INDEX "StoryFeedback_storyId_userId_key" ON "StoryFeedback"("storyId", "userId");

-- CreateIndex
CREATE INDEX "StoryFeedback_packId_idx" ON "StoryFeedback"("packId");

-- CreateIndex
CREATE INDEX "StoryFeedback_workspaceId_createdAt_idx" ON "StoryFeedback"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackFeedback_packId_userId_key" ON "PackFeedback"("packId", "userId");

-- CreateIndex
CREATE INDEX "PackFeedback_workspaceId_createdAt_idx" ON "PackFeedback"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelUsage_workspaceId_createdAt_idx" ON "ModelUsage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelUsage_task_createdAt_idx" ON "ModelUsage"("task", "createdAt");

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
