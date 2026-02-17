import { inngest } from "../client";
import { db } from "@/server/db";
import { createNotificationsForWorkspace } from "@/server/services/notifications";
import {
  computeTextDiff,
  mapDiffToChunks,
  determineSeverity,
  type SourceChunkInfo,
} from "@/lib/source-diff";
import { getAnalysisClient } from "@/lib/ai/model-router";

interface SourceVersionCreatedEvent {
  sourceId: string;
  newVersionId: string;
  previousVersionId: string;
  projectId: string;
  workspaceId: string;
  oldChunkIds: string[];
  newChunkIds: string[];
}

export const detectSourceChanges = inngest.createFunction(
  {
    id: "detect-source-changes",
    retries: 3,
  },
  { event: "source/version.created" },
  async ({ event }) => {
    const data = event.data as SourceVersionCreatedEvent;
    const {
      sourceId,
      newVersionId,
      previousVersionId,
      projectId,
      workspaceId,
      oldChunkIds,
      newChunkIds,
    } = data;

    const existingDiff = await db.sourceChunkDiff.findFirst({
      where: { newVersionId },
    });
    if (existingDiff) {
      return { sourceId, status: "skipped", reason: "idempotent" };
    }

    const [oldVersion, newVersion] = await Promise.all([
      db.sourceVersion.findUnique({
        where: { id: previousVersionId },
      }),
      db.sourceVersion.findUnique({
        where: { id: newVersionId },
      }),
    ]);

    if (!oldVersion || !newVersion) {
      return { sourceId, status: "skipped", reason: "version_not_found" };
    }

    if (oldVersion.contentHash === newVersion.contentHash) {
      return { sourceId, status: "skipped", reason: "no_changes" };
    }

    const oldChunks = await db.sourceChunk.findMany({
      where: { id: { in: oldChunkIds } },
      select: { id: true, content: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
    });

    const newChunks = await db.sourceChunk.findMany({
      where: { id: { in: newChunkIds } },
      select: { id: true, content: true, chunkIndex: true },
      orderBy: { chunkIndex: "asc" },
    });

    const oldChunkInfos: SourceChunkInfo[] = oldChunks.map((c) => ({
      id: c.id,
      content: c.content,
      chunkIndex: c.chunkIndex,
    }));

    const newChunkInfos: SourceChunkInfo[] = newChunks.map((c) => ({
      id: c.id,
      content: c.content,
      chunkIndex: c.chunkIndex,
    }));

    const diffRegions = computeTextDiff(oldVersion.content, newVersion.content);
    const chunkMappings = await mapDiffToChunks(
      diffRegions,
      oldChunkInfos,
      newChunkInfos,
      oldVersion.content,
      newVersion.content,
      db
    );

    await db.$transaction(async (tx) => {
      for (const m of chunkMappings) {
        await tx.sourceChunkDiff.create({
          data: {
            sourceId,
            oldVersionId: m.diffType !== "added" ? previousVersionId : null,
            newVersionId,
            diffType: m.diffType,
            oldChunkId: m.oldChunkId ? m.oldChunkId : null,
            newChunkId: m.newChunkId ?? null,
            similarityScore: m.similarityScore ?? null,
          },
        });
      }
    });

    const source = await db.source.findFirst({
      where: { id: sourceId, workspaceId },
      select: { name: true },
    });

    const allPacks = await db.pack.findMany({
      where: {
        projectId,
        workspaceId,
        reviewStatus: { not: "locked" },
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            stories: {
              where: { deletedAt: null },
              select: { id: true, want: true },
            },
          },
        },
      },
    });

    const packs = allPacks.filter((p) => {
      const ver = p.versions[0];
      if (!ver) return false;
      const ids = ver.sourceIds as string[] | null;
      return Array.isArray(ids) && ids.includes(sourceId);
    });

    const changedChunkIds = new Set(
      chunkMappings
        .filter((m) => m.diffType === "removed" || m.diffType === "modified")
        .map((m) => m.oldChunkId)
        .filter(Boolean)
    );

    const evidenceLinks = await db.evidenceLink.findMany({
      where: {
        sourceChunkId: { in: Array.from(changedChunkIds) },
      },
      select: { entityType: true, entityId: true },
    });

    const acIds = new Set<string>();
    const storyIds = new Set<string>();
    for (const el of evidenceLinks) {
      if (el.entityType === "acceptance_criteria") {
        acIds.add(el.entityId);
      } else if (el.entityType === "story") {
        storyIds.add(el.entityId);
      }
    }

    const acToStory = await db.acceptanceCriteria.findMany({
      where: { id: { in: Array.from(acIds) } },
      select: { id: true, storyId: true },
    });
    for (const ac of acToStory) {
      storyIds.add(ac.storyId);
    }

    const stories = await db.story.findMany({
      where: { id: { in: Array.from(storyIds) } },
      select: { id: true, want: true },
    });

    const storyTitles = stories.map((s) => s.want).join("; ");
    const diffSummary = chunkMappings
      .map((m) => `${m.diffType}: ${m.oldChunkId || "new"} -> ${m.newChunkId || "removed"}`)
      .slice(0, 10)
      .join("; ");

    async function generateImpactSummary(): Promise<string | null> {
      try {
        const analysisClient = getAnalysisClient();
        const response = await analysisClient.call({
          workspaceId,
          userId: "system",
          task: "impact_summary",
          packId: undefined,
          maxTokens: 120,
          systemPrompt:
            "Summarise how source changes affect requirements. One sentence, UK English.",
          userPrompt: `Source: ${source?.name ?? "Unknown"}. Changes: ${diffSummary}. Affected stories: ${storyTitles}`,
          sourceIds: [sourceId],
          sourceChunksSent: newChunkIds.length,
        });
        if (response.skipped) return null;
        return response.text || null;
      } catch {
        return null;
      }
    }

    const impactSummary = await generateImpactSummary();

    for (const pack of packs) {
      const version = pack.versions[0];
      if (!version) continue;

      const packStoryIds = version.stories
        .map((s) => s.id)
        .filter((id) => storyIds.has(id));
      const packAcCount = acToStory.filter((ac) =>
        packStoryIds.includes(ac.storyId)
      ).length;

      if (packStoryIds.length === 0 && packAcCount === 0) continue;

      const severity = determineSeverity(
        packAcCount,
        chunkMappings,
        oldChunkIds.length
      );

      await db.$transaction(async (tx) => {
        await tx.sourceChangeImpact.create({
          data: {
            sourceId,
            packId: pack.id,
            sourceVersionId: newVersionId,
            affectedStoryIds: packStoryIds,
            affectedStoryCount: packStoryIds.length,
            affectedAcCount: packAcCount,
            impactSummary,
            summaryPending: !impactSummary,
            severity,
          },
        });
      });

      await inngest.send({
        name: "pack/health.recompute",
        data: { packId: pack.id },
      });

      if (severity === "moderate" || severity === "major") {
        await createNotificationsForWorkspace({
          workspaceId,
          type: "source_changed",
          title: `Source '${source?.name ?? "Unknown"}' has changed`,
          body: impactSummary ?? `${severity} impact on ${pack.name}. ${packStoryIds.length} stories may be affected.`,
          link: `/workspace/${workspaceId}/projects/${projectId}/packs/${pack.id}`,
          relatedPackId: pack.id,
          relatedSourceId: sourceId,
          preferenceKey: "notifySourceChanges",
        });
      }
    }

    await db.sourceChunk.deleteMany({
      where: { id: { in: oldChunkIds } },
    });

    return {
      sourceId,
      status: "completed",
      impactsCreated: packs.length,
    };
  }
);
