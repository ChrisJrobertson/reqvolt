-- CreateEnum
CREATE TYPE "ApprovalScope" AS ENUM ('full_pack', 'scoped');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('pending', 'approved', 'changes_requested', 'expired');

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "packVersionId" TEXT NOT NULL,
    "approverName" TEXT NOT NULL,
    "approverEmail" TEXT NOT NULL,
    "approvalScope" "ApprovalScope" NOT NULL DEFAULT 'full_pack',
    "scopeFilter" JSONB,
    "token" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "signatureName" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_token_key" ON "ApprovalRequest"("token");

-- CreateIndex
CREATE INDEX "ApprovalRequest_packId_idx" ON "ApprovalRequest"("packId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_workspaceId_idx" ON "ApprovalRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_token_idx" ON "ApprovalRequest"("token");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_packId_fkey" FOREIGN KEY ("packId") REFERENCES "Pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_packVersionId_fkey" FOREIGN KEY ("packVersionId") REFERENCES "PackVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
