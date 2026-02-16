-- CreateTable
CREATE TABLE "JiraConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cloudId" TEXT NOT NULL,
    "siteUrl" VARCHAR(500) NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" VARCHAR(500) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JiraConnection_workspaceId_key" ON "JiraConnection"("workspaceId");

-- CreateIndex
CREATE INDEX "JiraConnection_workspaceId_idx" ON "JiraConnection"("workspaceId");

-- AddForeignKey
ALTER TABLE "JiraConnection" ADD CONSTRAINT "JiraConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
