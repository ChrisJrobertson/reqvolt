/**
 * Portfolio analytics: cross-project metrics and risk signals.
 */
import { db } from "../db";
import { subDays, subMonths, differenceInDays } from "date-fns";

export interface PortfolioMetrics {
  coverage: {
    averageEvidenceCoverage: number;
    averageApprovalCoverage: number;
    projectsWithNoBaseline: { count: number; names: string[] };
  };
  volatility: {
    baselineFrequency: Record<string, number>;
    changeRequestVolume: { total: number; approved: number; rejected: number };
    churnHotspots: { packId: string; packName: string; projectName: string; editCount: number }[];
  };
  cycleTime: {
    avgSourceToGeneration: number | null;
    avgGenerationToBaseline: number | null;
    avgBaselineToPush: number | null;
  };
  quality: {
    qaPassRate: number;
    commonQAFailures: { ruleCode: string; count: number }[];
    ambiguousWordTrend: { month: string; count: number }[];
  };
  riskSignals: {
    unresolvedConflicts: Record<string, number>;
    lowCoveragePacks: { packId: string; packName: string; projectId: string; projectName: string; coverage: number }[];
    orphanedStories: number;
    staleSources: number;
  };
}

export async function getPortfolioMetrics(
  workspaceId: string,
  dateRange?: { from: Date; to: Date }
): Promise<PortfolioMetrics> {
  const from = dateRange?.from ?? subDays(new Date(), 90);
  const to = dateRange?.to ?? new Date();

  const projects = await db.project.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, name: true },
  });

  const [packs, evidenceLinks, approvalRequests, baselines, changeRequests, auditLogs, qaFlags, storyExports, conflicts, sources] =
    await Promise.all([
      db.pack.findMany({
        where: { workspaceId },
        include: {
          project: { select: { id: true, name: true } },
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              stories: { where: { deletedAt: null }, select: { id: true } },
            },
          },
        },
      }),
      db.evidenceLink.findMany({
        where: {
          entityType: "story",
          sourceChunk: { source: { workspaceId } },
        },
        select: { entityId: true },
      }),
      db.approvalRequest.findMany({
        where: { workspaceId },
        select: { packId: true, status: true },
      }),
      db.baseline.findMany({
        where: { workspaceId, createdAt: { gte: from, lte: to } },
        include: { pack: { select: { projectId: true, project: { select: { name: true } } } } },
      }),
      db.changeRequest.findMany({
        where: { workspaceId, createdAt: { gte: from, lte: to } },
        select: { status: true },
      }),
      db.auditLog.findMany({
        where: {
          workspaceId,
          action: { in: ["story.updated", "story.added", "story.deleted", "acceptance_criteria.updated"] },
          createdAt: { gte: from, lte: to },
        },
        select: { metadata: true },
      }),
      db.qAFlag.findMany({
        where: { packVersion: { pack: { workspaceId } } },
        select: { packVersionId: true, entityId: true, ruleCode: true, createdAt: true },
      }),
      db.storyExport.findMany({
        where: { workspaceId },
        select: { packId: true, lastSyncedAt: true },
      }),
      db.evidenceConflict.findMany({
        where: { workspaceId, resolution: null },
        select: { projectId: true },
      }),
      db.source.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, updatedAt: true },
      }),
    ]);

  const storyIdsWithEvidence = new Set(evidenceLinks.map((e) => e.entityId));
  const packIdsWithApproval = new Set(
    approvalRequests.filter((a) => a.status === "approved").map((a) => a.packId)
  );

  let totalStories = 0;
  let storiesWithEvidence = 0;
  const packCoverages: { packId: string; packName: string; projectId: string; projectName: string; coverage: number }[] = [];
  const orphanedStories: string[] = [];

  for (const pack of packs) {
    const latestVersion = pack.versions[0];
    if (!latestVersion) continue;
    const storyIds = latestVersion.stories.map((s) => s.id);
    totalStories += storyIds.length;
    const withEvidence = storyIds.filter((id) => storyIdsWithEvidence.has(id)).length;
    storiesWithEvidence += withEvidence;
    const coverage = storyIds.length > 0 ? (withEvidence / storyIds.length) * 100 : 0;
    packCoverages.push({
      packId: pack.id,
      packName: pack.name,
      projectId: pack.projectId,
      projectName: pack.project.name,
      coverage,
    });
    storyIds.filter((id) => !storyIdsWithEvidence.has(id)).forEach((id) => orphanedStories.push(id));
  }

  const averageEvidenceCoverage =
    totalStories > 0 ? Math.round((storiesWithEvidence / totalStories) * 100) : 0;
  const packsWithApproval = packs.filter((p) => packIdsWithApproval.has(p.id)).length;
  const averageApprovalCoverage =
    packs.length > 0 ? Math.round((packsWithApproval / packs.length) * 100) : 0;

  const packIdsWithBaseline = new Set(baselines.map((b) => b.packId));
  const projectsWithNoBaseline = projects.filter((p) => {
    const projectPacks = packs.filter((pack) => pack.projectId === p.id);
    return !projectPacks.some((pack) => packIdsWithBaseline.has(pack.id));
  });
  const baselineCountByProject: Record<string, number> = {};
  for (const b of baselines) {
    const projectName = b.pack?.project?.name ?? "Unknown";
    baselineCountByProject[projectName] = (baselineCountByProject[projectName] ?? 0) + 1;
  }

  const crApproved = changeRequests.filter((c) => c.status === "approved").length;
  const crRejected = changeRequests.filter((c) => c.status === "rejected").length;

  const editCountByPack = new Map<string, number>();
  for (const log of auditLogs) {
    const meta = log.metadata as { packId?: string } | null;
    if (meta?.packId) {
      editCountByPack.set(meta.packId, (editCountByPack.get(meta.packId) ?? 0) + 1);
    }
  }
  const churnHotspots = [...editCountByPack.entries()]
    .map(([packId, editCount]) => {
      const pack = packs.find((p) => p.id === packId);
      return pack
        ? { packId, packName: pack.name, projectName: pack.project.name, editCount }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.editCount - a.editCount)
    .slice(0, 5);

  const sourceToGenDays: number[] = [];
  const genToBaselineDays: number[] = [];
  const baselineToPushDays: number[] = [];

  for (const project of projects) {
    const projectPacks = packs.filter((p) => p.projectId === project.id);
    const projectSources = await db.source.findFirst({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    for (const pack of projectPacks) {
      const firstVersion = await db.packVersion.findFirst({
        where: { packId: pack.id },
        orderBy: { versionNumber: "asc" },
        select: { createdAt: true },
      });
      const firstBaseline = await db.baseline.findFirst({
        where: { packId: pack.id },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const firstPush = storyExports
        .filter((se) => se.packId === pack.id && se.lastSyncedAt)
        .sort(
          (a, b) =>
            (a.lastSyncedAt?.getTime() ?? 0) - (b.lastSyncedAt?.getTime() ?? 0)
        )[0];

      if (projectSources?.createdAt && firstVersion?.createdAt) {
        sourceToGenDays.push(
          differenceInDays(firstVersion.createdAt, projectSources.createdAt)
        );
      }
      if (firstVersion?.createdAt && firstBaseline?.createdAt) {
        genToBaselineDays.push(
          differenceInDays(firstBaseline.createdAt, firstVersion.createdAt)
        );
      }
      if (firstBaseline?.createdAt && firstPush?.lastSyncedAt) {
        baselineToPushDays.push(
          differenceInDays(firstPush.lastSyncedAt, firstBaseline.createdAt)
        );
      }
    }
  }

  const storyIdsWithQaFlags = new Set(qaFlags.map((f) => f.entityId));
  const storiesWithFailingQa = storyIdsWithQaFlags.size;
  const qaPassRate =
    totalStories > 0
      ? Math.round(((totalStories - storiesWithFailingQa) / totalStories) * 100)
      : 100;

  const ruleCounts: Record<string, number> = {};
  for (const f of qaFlags) {
    ruleCounts[f.ruleCode] = (ruleCounts[f.ruleCode] ?? 0) + 1;
  }
  const commonQAFailures = Object.entries(ruleCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([ruleCode, count]) => ({ ruleCode, count }));

  const vagueTermFlags = qaFlags.filter((f) => f.ruleCode === "VAGUE_TERM");
  const monthCounts: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    const m = subMonths(new Date(), i);
    monthCounts[`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`] = 0;
  }
  for (const f of vagueTermFlags) {
    const key = `${f.createdAt.getFullYear()}-${String(f.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (key in monthCounts) monthCounts[key]++;
  }
  const ambiguousWordTrend = Object.entries(monthCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));

  const conflictCountByProject: Record<string, number> = {};
  for (const c of conflicts) {
    conflictCountByProject[c.projectId] = (conflictCountByProject[c.projectId] ?? 0) + 1;
  }

  const staleCutoff = subDays(new Date(), 60);
  const staleSources = sources.filter((s) => s.updatedAt < staleCutoff).length;

  return {
    coverage: {
      averageEvidenceCoverage,
      averageApprovalCoverage,
      projectsWithNoBaseline: {
        count: projectsWithNoBaseline.length,
        names: projectsWithNoBaseline.map((p) => p.name),
      },
    },
    volatility: {
      baselineFrequency: baselineCountByProject,
      changeRequestVolume: {
        total: changeRequests.length,
        approved: crApproved,
        rejected: crRejected,
      },
      churnHotspots,
    },
    cycleTime: {
      avgSourceToGeneration:
        sourceToGenDays.length > 0
          ? Math.round(sourceToGenDays.reduce((a, b) => a + b, 0) / sourceToGenDays.length)
          : null,
      avgGenerationToBaseline:
        genToBaselineDays.length > 0
          ? Math.round(genToBaselineDays.reduce((a, b) => a + b, 0) / genToBaselineDays.length)
          : null,
      avgBaselineToPush:
        baselineToPushDays.length > 0
          ? Math.round(baselineToPushDays.reduce((a, b) => a + b, 0) / baselineToPushDays.length)
          : null,
    },
    quality: {
      qaPassRate,
      commonQAFailures,
      ambiguousWordTrend,
    },
    riskSignals: {
      unresolvedConflicts: conflictCountByProject,
      lowCoveragePacks: packCoverages.filter((p) => p.coverage < 50),
      orphanedStories: orphanedStories.length,
      staleSources,
    },
  };
}
