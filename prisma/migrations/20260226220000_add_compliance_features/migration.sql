-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "sessionTimeoutHours" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN "dataRegion" TEXT NOT NULL DEFAULT 'eu-west-1',
ADD COLUMN "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ssoProvider" TEXT,
ADD COLUMN "ssoMetadataUrl" TEXT,
ADD COLUMN "ssoEntityId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "legalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "legalHoldSetBy" TEXT,
ADD COLUMN "legalHoldSetAt" TIMESTAMP(3);
