import { db } from "../db";
import type { Prisma } from "@prisma/client";

interface AuditLogInput {
  workspaceId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

export const auditService = {
  async log(input: AuditLogInput) {
    return db.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata,
      },
    });
  },
};
