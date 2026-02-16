import { inngest } from "../client";
import { db } from "@/server/db";
import { computeAndPersistPackHealth } from "@/server/services/health";
import { createNotificationsForWorkspace } from "@/server/services/notifications";
import type { HealthStatus } from "@prisma/client";

const IDEMPOTENCY_WINDOW_MS = 60_000; // 60 seconds

const STATUS_TIER_ORDER: Record<HealthStatus, number> = {
  healthy: 0,
  stale: 1,
  at_risk: 2,
  outdated: 3,
};

function statusTierChangedForWorse(
  previous: HealthStatus | null,
  next: HealthStatus
): boolean {
  if (!previous) return false;
  return STATUS_TIER_ORDER[next] > STATUS_TIER_ORDER[previous];
}

export const recomputePackHealth = inngest.createFunction(
  {
    id: "recompute-pack-health",
    retries: 3,
  },
  [
    { cron: "0 6 * * *" },
    { event: "pack/health.recompute" },
  ],
  async ({ event, step }) => {
    const isEventDriven = event.name === "pack/health.recompute";
    const packIds: string[] = [];

    if (!isEventDriven) {
      const packs = await db.pack.findMany({
        where: { reviewStatus: { not: "locked" } },
        select: { id: true },
      });
      packIds.push(...packs.map((p) => p.id));
    } else {
      const { packId } = (event.data as { packId: string }) ?? {};
      if (!packId) return { status: "skipped", reason: "missing_packId" };

      const pack = await db.pack.findFirst({
        where: { id: packId },
        select: { id: true, lastHealthCheck: true },
      });
      if (!pack) return { status: "skipped", reason: "pack_not_found" };

      if (pack.lastHealthCheck) {
        const elapsed = Date.now() - pack.lastHealthCheck.getTime();
        if (elapsed < IDEMPOTENCY_WINDOW_MS) {
          return { status: "skipped", reason: "recently_computed", packId };
        }
      }
      packIds.push(packId);
    }

    let processed = 0;
    for (const packId of packIds) {
      await step.run(`compute-health-${packId}`, async () => {
        const pack = await db.pack.findFirst({
          where: { id: packId },
          select: {
            id: true,
            name: true,
            workspaceId: true,
            projectId: true,
            healthStatus: true,
            healthScore: true,
          },
        });
        if (!pack) return { packId, status: "skipped", reason: "not_found" };

        const previousStatus = pack.healthStatus as HealthStatus | null;

        const result = await computeAndPersistPackHealth(packId);
        processed++;

        if (
          statusTierChangedForWorse(previousStatus, result.status) &&
          pack.workspaceId
        ) {
          await createNotificationsForWorkspace({
            workspaceId: pack.workspaceId,
            type: "health_degraded",
            title: `Pack health declined: ${pack.name}`,
            body: `Health changed from ${previousStatus ?? "unknown"} to ${result.status} (score: ${result.score})`,
            link: `/workspace/${pack.workspaceId}/projects/${pack.projectId}/packs/${packId}`,
            relatedPackId: packId,
            preferenceKey: "notifyHealthDegraded",
          });
        }

        return { packId, status: "computed" };
      });
    }

    return { status: "completed", processed, total: packIds.length };
  }
);
