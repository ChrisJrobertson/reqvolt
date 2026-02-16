/**
 * Pack health computation service.
 * Computes health score (0-100) from five weighted factors.
 * UK English throughout.
 */
import { db } from "../db";
import type { HealthStatus } from "@prisma/client";

const DEFAULT_WEIGHTS = {
  sourceDrift: 0.3,
  evidenceCoverage: 0.25,
  qaPassRate: 0.2,
  deliveryFeedback: 0.15,
  sourceAge: 0.1,
} as const;

const STATUS_THRESHOLDS = {
  healthy: { min: 80, max: 100 },
  stale: { min: 60, max: 79 },
  at_risk: { min: 40, max: 59 },
  outdated: { min: 0, max: 39 },
} as const;

export interface HealthFactors extends Record<string, number> {
  sourceDrift: number;
  evidenceCoverage: number;
  qaPassRate: number;
  deliveryFeedback: number;
  sourceAge: number;
}

export interface ComputeHealthResult {
  score: number;
  status: HealthStatus;
  factors: HealthFactors;
}

function normaliseSourceDrift(diffCount: number): number {
  if (diffCount <= 0) return 100;
  if (diffCount >= 20) return 0;
  return Math.round(100 - (diffCount / 20) * 100);
}

function normaliseDeliveryFeedback(unresolvedCount: number): number {
  if (unresolvedCount <= 0) return 100;
  if (unresolvedCount >= 5) return 0;
  return Math.round(100 - (unresolvedCount / 5) * 100);
}

function normaliseSourceAge(daysSinceUpdate: number): number {
  if (daysSinceUpdate <= 7) return 100;
  if (daysSinceUpdate >= 90) return 0;
  return Math.round(100 - ((daysSinceUpdate - 7) / (90 - 7)) * 100);
}

function scoreToStatus(score: number): HealthStatus {
  if (score >= STATUS_THRESHOLDS.healthy.min) return "healthy";
  if (score >= STATUS_THRESHOLDS.stale.min) return "stale";
  if (score >= STATUS_THRESHOLDS.at_risk.min) return "at_risk";
  return "outdated";
}

export async function computePackHealth(packId: string): Promise<ComputeHealthResult> {
  const pack = await db.pack.findFirst({
    where: { id: packId },
    include: {
      project: { include: { workspace: { select: { healthWeights: true } } } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: {
          stories: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!pack) throw new Error("Pack not found");

  const version = pack.versions[0];
  if (!version) {
    return {
      score: 100,
      status: "healthy",
      factors: {
        sourceDrift: 100,
        evidenceCoverage: 100,
        qaPassRate: 100,
        deliveryFeedback: 100,
        sourceAge: 100,
      },
    };
  }

  const sourceIds = (version.sourceIds as string[]) ?? [];
  const weights = (pack.project.workspace.healthWeights as Record<string, number>) ?? DEFAULT_WEIGHTS;

  // sourceDrift: SourceChunkDiffs since pack version created
  const diffCount = await db.sourceChunkDiff.count({
    where: {
      sourceId: { in: sourceIds },
      createdAt: { gt: version.createdAt },
    },
  });
  const sourceDrift = normaliseSourceDrift(diffCount);

  // evidenceCoverage: ACs with at least one high-confidence EvidenceLink
  const acs = await db.acceptanceCriteria.findMany({
    where: {
      storyId: { in: version.stories.map((s: { id: string }) => s.id) },
      deletedAt: null,
    },
    select: { id: true, storyId: true },
  });
  const acIds = acs.map((a) => a.id);
  const acToStory = new Map(acs.map((a) => [a.id, a.storyId]));

  const evidenceLinks = acIds.length
    ? await db.evidenceLink.findMany({
        where: {
          entityType: "acceptance_criteria",
          entityId: { in: acIds },
          confidence: "high",
        },
        select: { entityId: true },
      })
    : [];
  const acsWithEvidence = new Set(evidenceLinks.map((l) => l.entityId)).size;

  const evidenceCoverage = acIds.length > 0 ? Math.round((acsWithEvidence / acIds.length) * 100) : 100;

  // qaPassRate: Stories with zero unresolved QAFlags
  const storyIds = version.stories.map((s: { id: string }) => s.id);
  const unresolvedFlags = await db.qAFlag.findMany({
    where: {
      packVersionId: version.id,
      resolvedBy: null,
      OR: [
        { entityType: "story", entityId: { in: storyIds } },
        { entityType: "acceptance_criteria", entityId: { in: acIds } },
      ],
    },
    select: { entityType: true, entityId: true },
  });

  const storiesWithFlags = new Set<string>();
  for (const flag of unresolvedFlags) {
    if (flag.entityType === "story") {
      storiesWithFlags.add(flag.entityId);
    } else {
      const storyId = acToStory.get(flag.entityId);
      if (storyId) storiesWithFlags.add(storyId);
    }
  }

  const storiesWithoutFlags = storyIds.filter((id: string) => !storiesWithFlags.has(id)).length;
  const qaPassRate = storyIds.length > 0 ? Math.round((storiesWithoutFlags / storyIds.length) * 100) : 100;

  // deliveryFeedback: Unresolved feedback count
  const unresolvedFeedback = await db.deliveryFeedback.count({
    where: { packId, isResolved: false },
  });
  const deliveryFeedback = normaliseDeliveryFeedback(unresolvedFeedback);

  // sourceAge: Days since most recent source update or pack version creation
  let mostRecentDate = version.createdAt;
  if (sourceIds.length > 0) {
    const sources = await db.source.findMany({
      where: { id: { in: sourceIds } },
      select: { updatedAt: true },
    });
    const maxSource = sources.reduce(
      (acc: Date, s: { updatedAt: Date }) => (s.updatedAt > acc ? s.updatedAt : acc),
      new Date(0)
    );
    if (maxSource > mostRecentDate) mostRecentDate = maxSource;
  }
  const daysSince = Math.floor((Date.now() - mostRecentDate.getTime()) / (24 * 60 * 60 * 1000));
  const sourceAge = normaliseSourceAge(daysSince);

  const factors: HealthFactors = {
    sourceDrift,
    evidenceCoverage,
    qaPassRate,
    deliveryFeedback,
    sourceAge,
  };

  const score = Math.round(
    sourceDrift * weights.sourceDrift +
      evidenceCoverage * (weights.evidenceCoverage ?? 0.25) +
      qaPassRate * weights.qaPassRate +
      deliveryFeedback * weights.deliveryFeedback +
      sourceAge * weights.sourceAge
  );

  const clampedScore = Math.max(0, Math.min(100, score));
  const status = scoreToStatus(clampedScore);

  return { score: clampedScore, status, factors };
}

/**
 * Compute pack health and persist to database.
 * Creates PackHealth record and updates Pack.healthScore, healthStatus, lastHealthCheck.
 */
export async function computeAndPersistPackHealth(packId: string): Promise<ComputeHealthResult> {
  const result = await computePackHealth(packId);

  await db.$transaction(async (tx) => {
    await tx.packHealth.create({
      data: {
        packId,
        score: result.score,
        status: result.status,
        factors: result.factors as object,
      },
    });
    await tx.pack.update({
      where: { id: packId },
      data: {
        healthScore: result.score,
        healthStatus: result.status,
        lastHealthCheck: new Date(),
      },
    });
  });

  return result;
}
