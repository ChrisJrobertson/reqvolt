-- CreateTable
CREATE TABLE "MethodologyConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MethodologyConfig_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "methodologyId" TEXT;

-- CreateIndex
CREATE INDEX "MethodologyConfig_workspaceId_idx" ON "MethodologyConfig"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MethodologyConfig_workspaceId_name_key" ON "MethodologyConfig"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Project_methodologyId_idx" ON "Project"("methodologyId");

-- AddForeignKey
ALTER TABLE "MethodologyConfig" ADD CONSTRAINT "MethodologyConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_methodologyId_fkey" FOREIGN KEY ("methodologyId") REFERENCES "MethodologyConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
