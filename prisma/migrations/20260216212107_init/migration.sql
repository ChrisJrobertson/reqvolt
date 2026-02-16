-- Enable pgvector extension (required for SourceChunk.embedding)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('Admin', 'Member');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MEETING_NOTES', 'CUSTOMER_FEEDBACK', 'WORKSHOP_NOTES', 'RETRO_NOTES', 'INTERVIEW_TRANSCRIPT', 'TRANSCRIPT', 'EMAIL', 'PDF', 'DOCX', 'OTHER');

-- CreateEnum
CREATE TYPE "PackReviewStatus" AS ENUM ('draft', 'in_review', 'partially_approved', 'approved', 'locked');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('healthy', 'stale', 'at_risk', 'outdated');

-- CreateEnum
CREATE TYPE "ExtractionQuality" AS ENUM ('good', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "EvidenceEntityType" AS ENUM ('story', 'acceptance_criteria');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "EvolutionStatus" AS ENUM ('new', 'strengthened', 'contradicted', 'unchanged', 'removed');

-- CreateEnum
CREATE TYPE "QARuleCode" AS ENUM ('VAGUE_TERM', 'UNTESTABLE', 'OVERLOADED_AC', 'MISSING_CLAUSE');

-- CreateEnum
CREATE TYPE "QASeverity" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "QAResolvedBy" AS ENUM ('fixed', 'dismissed');

-- CreateEnum
CREATE TYPE "PushStatus" AS ENUM ('success', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('approved', 'rejected');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "healthWeights" JSONB NOT NULL DEFAULT '{"sourceDrift":0.30,"evidenceCoverage":0.25,"qaPassRate":0.20,"deliveryFeedback":0.15,"sourceAge":0.10}',
    "similarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.78,
    "jiraRejectionStatuses" TEXT[] DEFAULT ARRAY['Rejected', 'Won''t Do', 'Cancelled']::TEXT[],
    "jiraSignalWords" TEXT[] DEFAULT ARRAY['unclear', 'ambiguous', 'question', 'assumption', 'wrong', 'missing', 'confused', 'what does', 'what do you mean']::TEXT[],
    "mondayRejectionStatuses" TEXT[] DEFAULT ARRAY['Stuck', 'Rejected']::TEXT[],

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "email" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "forwardingEmail" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "extractionQuality" "ExtractionQuality",
    "status" "SourceStatus" NOT NULL DEFAULT 'pending',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentVersionId" TEXT,
    "sourceConnectionType" TEXT NOT NULL DEFAULT 'uploaded',
    "externalSourceId" VARCHAR(500),
    "externalSourceUrl" VARCHAR(1000),
    "lastSyncedAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "chunkIndex" INTEGER NOT NULL,
    "metadata" JSONB,
    "embedding" vector(1536),

    CONSTRAINT "SourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reviewStatus" "PackReviewStatus" NOT NULL DEFAULT 'draft',
    "healthScore" INTEGER,
    "healthStatus" "HealthStatus" NOT NULL DEFAULT 'healthy',
    "lastHealthCheck" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackVersion" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "sourceIds" JSONB NOT NULL,
    "summary" TEXT,
    "nonGoals" TEXT,
    "openQuestions" JSONB,
    "assumptions" JSONB,
    "decisions" JSONB,
    "risks" JSONB,
    "generationConfig" JSONB,
    "changeAnalysis" JSONB,
    "editLockUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "packVersionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "persona" TEXT NOT NULL,
    "want" TEXT NOT NULL,
    "soThat" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcceptanceCriteria" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "given" TEXT NOT NULL,
    "when" TEXT NOT NULL,
    "then" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcceptanceCriteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceLink" (
    "id" TEXT NOT NULL,
    "entityType" "EvidenceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceChunkId" TEXT NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "evolutionStatus" "EvolutionStatus" NOT NULL DEFAULT 'unchanged',
    "previousConfidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QAFlag" (
    "id" TEXT NOT NULL,
    "packVersionId" TEXT NOT NULL,
    "entityType" "EvidenceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "ruleCode" "QARuleCode" NOT NULL,
    "severity" "QASeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "suggestedFix" TEXT,
    "resolvedBy" "QAResolvedBy",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QAFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLink" (
    "id" TEXT NOT NULL,
    "packVersionId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "reviewLinkId" TEXT NOT NULL,
    "entityType" "EvidenceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlossaryEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlossaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryApproval" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "status" "ApprovalStatus" NOT NULL,

    CONSTRAINT "StoryApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "expectedSize" BIGINT NOT NULL,
    "expectedContentType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MondayConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mondayBoardId" TEXT NOT NULL,
    "mondayGroupId" TEXT NOT NULL,
    "fieldMapping" JSONB NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL,
    "connectedBy" TEXT NOT NULL,

    CONSTRAINT "MondayConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MondayPushLog" (
    "id" TEXT NOT NULL,
    "packVersionId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "mondayItemId" TEXT NOT NULL,
    "pushedAt" TIMESTAMP(3) NOT NULL,
    "pushedBy" TEXT NOT NULL,
    "status" "PushStatus" NOT NULL,
    "errorMessage" TEXT,

    CONSTRAINT "MondayPushLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" VARCHAR(64) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceChunkDiff" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "oldVersionId" TEXT,
    "newVersionId" TEXT NOT NULL,
    "diffType" TEXT NOT NULL,
    "oldChunkId" TEXT,
    "newChunkId" TEXT,
    "similarityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceChunkDiff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackHealth" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "factors" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryExport" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "packVersionId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalSystem" TEXT NOT NULL,
    "externalId" VARCHAR(255) NOT NULL,
    "externalUrl" VARCHAR(1000),
    "externalStatus" VARCHAR(100),
    "externalStatusCategory" VARCHAR(50),
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryFeedback" (
    "id" TEXT NOT NULL,
    "storyExportId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "feedbackType" TEXT NOT NULL,
    "externalAuthor" VARCHAR(255),
    "content" TEXT,
    "externalCreatedAt" TIMESTAMP(3),
    "matchedSignalWords" TEXT[],
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" VARCHAR(255),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceChangeImpact" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "affectedStoryIds" TEXT[],
    "affectedStoryCount" INTEGER NOT NULL,
    "affectedAcCount" INTEGER NOT NULL,
    "impactSummary" TEXT,
    "summaryPending" BOOLEAN NOT NULL DEFAULT false,
    "severity" TEXT NOT NULL DEFAULT 'moderate',
    "isAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceChangeImpact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "keyHash" VARCHAR(64) NOT NULL,
    "keyPrefix" VARCHAR(10) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdBy" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "type" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "body" TEXT,
    "link" VARCHAR(1000),
    "relatedPackId" TEXT,
    "relatedSourceId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "emailFrequency" TEXT NOT NULL DEFAULT 'daily',
    "notifySourceChanges" BOOLEAN NOT NULL DEFAULT true,
    "notifyDeliveryFeedback" BOOLEAN NOT NULL DEFAULT true,
    "notifyHealthDegraded" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmailIngested" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_forwardingEmail_key" ON "Project"("forwardingEmail");

-- CreateIndex
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");

-- CreateIndex
CREATE INDEX "Source_projectId_idx" ON "Source"("projectId");

-- CreateIndex
CREATE INDEX "Source_workspaceId_idx" ON "Source"("workspaceId");

-- CreateIndex
CREATE INDEX "Source_deletedAt_idx" ON "Source"("deletedAt");

-- CreateIndex
CREATE INDEX "SourceChunk_sourceId_idx" ON "SourceChunk"("sourceId");

-- CreateIndex
CREATE INDEX "Pack_projectId_idx" ON "Pack"("projectId");

-- CreateIndex
CREATE INDEX "Pack_workspaceId_idx" ON "Pack"("workspaceId");

-- CreateIndex
CREATE INDEX "PackVersion_packId_idx" ON "PackVersion"("packId");

-- CreateIndex
CREATE INDEX "Story_packVersionId_idx" ON "Story"("packVersionId");

-- CreateIndex
CREATE INDEX "AcceptanceCriteria_storyId_idx" ON "AcceptanceCriteria"("storyId");

-- CreateIndex
CREATE INDEX "EvidenceLink_entityType_entityId_idx" ON "EvidenceLink"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "EvidenceLink_sourceChunkId_idx" ON "EvidenceLink"("sourceChunkId");

-- CreateIndex
CREATE INDEX "QAFlag_packVersionId_idx" ON "QAFlag"("packVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewLink_token_key" ON "ReviewLink"("token");

-- CreateIndex
CREATE INDEX "ReviewLink_packVersionId_idx" ON "ReviewLink"("packVersionId");

-- CreateIndex
CREATE INDEX "ReviewLink_token_idx" ON "ReviewLink"("token");

-- CreateIndex
CREATE INDEX "ReviewComment_reviewLinkId_idx" ON "ReviewComment"("reviewLinkId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_idx" ON "AuditLog"("workspaceId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "Template_workspaceId_idx" ON "Template"("workspaceId");

-- CreateIndex
CREATE INDEX "GlossaryEntry_workspaceId_idx" ON "GlossaryEntry"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationCache_cacheKey_key" ON "GenerationCache"("cacheKey");

-- CreateIndex
CREATE INDEX "GenerationCache_expiresAt_idx" ON "GenerationCache"("expiresAt");

-- CreateIndex
CREATE INDEX "StoryApproval_storyId_idx" ON "StoryApproval"("storyId");

-- CreateIndex
CREATE INDEX "UploadSession_workspaceId_idx" ON "UploadSession"("workspaceId");

-- CreateIndex
CREATE INDEX "UploadSession_expiresAt_idx" ON "UploadSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MondayConnection_workspaceId_key" ON "MondayConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "MondayPushLog_packVersionId_idx" ON "MondayPushLog"("packVersionId");

-- CreateIndex
CREATE INDEX "MondayPushLog_storyId_idx" ON "MondayPushLog"("storyId");

-- CreateIndex
CREATE INDEX "SourceVersion_sourceId_idx" ON "SourceVersion"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceVersion_sourceId_versionNumber_key" ON "SourceVersion"("sourceId", "versionNumber");

-- CreateIndex
CREATE INDEX "SourceChunkDiff_sourceId_newVersionId_idx" ON "SourceChunkDiff"("sourceId", "newVersionId");

-- CreateIndex
CREATE INDEX "PackHealth_packId_computedAt_idx" ON "PackHealth"("packId", "computedAt");

-- CreateIndex
CREATE INDEX "StoryExport_packId_idx" ON "StoryExport"("packId");

-- CreateIndex
CREATE INDEX "StoryExport_workspaceId_externalSystem_idx" ON "StoryExport"("workspaceId", "externalSystem");

-- CreateIndex
CREATE UNIQUE INDEX "StoryExport_storyId_externalSystem_packVersionId_key" ON "StoryExport"("storyId", "externalSystem", "packVersionId");

-- CreateIndex
CREATE INDEX "DeliveryFeedback_packId_idx" ON "DeliveryFeedback"("packId");

-- CreateIndex
CREATE INDEX "DeliveryFeedback_storyId_idx" ON "DeliveryFeedback"("storyId");

-- CreateIndex
CREATE INDEX "SourceChangeImpact_packId_idx" ON "SourceChangeImpact"("packId");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "Notification_userId_workspaceId_idx" ON "Notification"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_workspaceId_userId_key" ON "NotificationPreference"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pack" ADD CONSTRAINT "Pack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackVersion" ADD CONSTRAINT "PackVersion_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_packVersionId_fkey" FOREIGN KEY ("packVersionId") REFERENCES "PackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcceptanceCriteria" ADD CONSTRAINT "AcceptanceCriteria_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_sourceChunkId_fkey" FOREIGN KEY ("sourceChunkId") REFERENCES "SourceChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QAFlag" ADD CONSTRAINT "QAFlag_packVersionId_fkey" FOREIGN KEY ("packVersionId") REFERENCES "PackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLink" ADD CONSTRAINT "ReviewLink_packVersionId_fkey" FOREIGN KEY ("packVersionId") REFERENCES "PackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_reviewLinkId_fkey" FOREIGN KEY ("reviewLinkId") REFERENCES "ReviewLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlossaryEntry" ADD CONSTRAINT "GlossaryEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryApproval" ADD CONSTRAINT "StoryApproval_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadSession" ADD CONSTRAINT "UploadSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MondayConnection" ADD CONSTRAINT "MondayConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MondayPushLog" ADD CONSTRAINT "MondayPushLog_packVersionId_fkey" FOREIGN KEY ("packVersionId") REFERENCES "PackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MondayPushLog" ADD CONSTRAINT "MondayPushLog_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceVersion" ADD CONSTRAINT "SourceVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunkDiff" ADD CONSTRAINT "SourceChunkDiff_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunkDiff" ADD CONSTRAINT "SourceChunkDiff_oldVersionId_fkey" FOREIGN KEY ("oldVersionId") REFERENCES "SourceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunkDiff" ADD CONSTRAINT "SourceChunkDiff_newVersionId_fkey" FOREIGN KEY ("newVersionId") REFERENCES "SourceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackHealth" ADD CONSTRAINT "PackHealth_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryExport" ADD CONSTRAINT "StoryExport_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryExport" ADD CONSTRAINT "StoryExport_packVersionId_fkey" FOREIGN KEY ("packVersionId") REFERENCES "PackVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryExport" ADD CONSTRAINT "StoryExport_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryExport" ADD CONSTRAINT "StoryExport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryFeedback" ADD CONSTRAINT "DeliveryFeedback_storyExportId_fkey" FOREIGN KEY ("storyExportId") REFERENCES "StoryExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryFeedback" ADD CONSTRAINT "DeliveryFeedback_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryFeedback" ADD CONSTRAINT "DeliveryFeedback_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChangeImpact" ADD CONSTRAINT "SourceChangeImpact_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChangeImpact" ADD CONSTRAINT "SourceChangeImpact_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChangeImpact" ADD CONSTRAINT "SourceChangeImpact_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "SourceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
