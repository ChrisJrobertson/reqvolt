-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "retentionAutoArchiveDays" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN "retentionAutoDeleteDays" INTEGER NOT NULL DEFAULT 365,
ADD COLUMN "retentionEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "exemptFromRetention" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SourceChunk" ADD COLUMN "redactedAt" TIMESTAMP(3),
ADD COLUMN "redactedBy" VARCHAR(255);
