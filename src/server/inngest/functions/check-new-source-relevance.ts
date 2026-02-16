import { inngest } from "../client";
import { db } from "@/server/db";
import { createNotificationsForWorkspace } from "@/server/services/notifications";

export const checkNewSourceRelevance = inngest.createFunction(
  {
    id: "check-new-source-relevance",
    retries: 2,
  },
  { event: "source/chunks.embedded" },
  async ({ event }) => {
    const { sourceId, projectId } = event.data as {
      sourceId: string;
      projectId: string;
    };

    const source = await db.source.findFirst({
      where: { id: sourceId },
      select: { name: true, workspaceId: true },
    });

    if (!source) return { sourceId, status: "skipped", reason: "source_not_found" };

    const packs = await db.pack.findMany({
      where: {
        projectId,
        workspaceId: source.workspaceId,
        reviewStatus: { not: "locked" },
      },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });

    if (packs.length === 0) {
      return { sourceId, status: "skipped", reason: "no_packs" };
    }

    const workspace = await db.workspace.findFirst({
      where: { id: source.workspaceId },
      select: { similarityThreshold: true },
    });

    const threshold = workspace?.similarityThreshold ?? 0.78;

    const newChunks = await db.sourceChunk.findMany({
      where: { sourceId },
      select: { id: true },
    });

    if (newChunks.length === 0) {
      return { sourceId, status: "skipped", reason: "no_chunks" };
    }

    for (const pack of packs) {
      const version = pack.versions[0];
      if (!version) continue;

      const stories = await db.story.findMany({
        where: { packVersionId: version.id, deletedAt: null },
        select: { id: true },
      });
      const storyIds = stories.map((s) => s.id);
      const acs = await db.acceptanceCriteria.findMany({
        where: { storyId: { in: storyIds } },
        select: { id: true },
      });
      const acIds = acs.map((a) => a.id);
      const entityIds = [...storyIds, ...acIds];

      const evidenceChunkIds = await db.evidenceLink.findMany({
        where: {
          entityType: { in: ["story", "acceptance_criteria"] },
          entityId: { in: entityIds },
        },
        select: { sourceChunkId: true },
      });

      const existingChunkIds = [...new Set(evidenceChunkIds.map((e) => e.sourceChunkId))];
      if (existingChunkIds.length === 0) continue;

      const inParams = existingChunkIds.map((_, i) => `$${i + 2}`).join(", ");

      const matches = await db.$queryRawUnsafe<
        Array<{ newChunkId: string; existingChunkId: string; similarity: number }>
      >(
        `SELECT sc_new.id AS "newChunkId", sc_existing.id AS "existingChunkId",
                1 - (sc_new.embedding <=> sc_existing.embedding) AS similarity
         FROM "SourceChunk" sc_new
         CROSS JOIN "SourceChunk" sc_existing
         WHERE sc_new."sourceId" = $1
           AND sc_existing.id IN (${inParams})
           AND sc_new.embedding IS NOT NULL
           AND sc_existing.embedding IS NOT NULL
           AND 1 - (sc_new.embedding <=> sc_existing.embedding) > $${existingChunkIds.length + 2}
         ORDER BY similarity DESC
         LIMIT 20`,
        sourceId,
        ...existingChunkIds,
        threshold
      );

      if (matches.length === 0) continue;

      const existingNotification = await db.notification.findFirst({
        where: {
          workspaceId: source.workspaceId,
          type: "source_relevant",
          relatedSourceId: sourceId,
          relatedPackId: pack.id,
        },
      });

      if (existingNotification) continue;

      const affectedStoryIds = new Set<string>();
      for (const m of matches) {
        const links = await db.evidenceLink.findMany({
          where: { sourceChunkId: m.existingChunkId },
          select: { entityType: true, entityId: true },
        });
        for (const l of links) {
          if (l.entityType === "story") {
            affectedStoryIds.add(l.entityId);
          } else {
            const ac = await db.acceptanceCriteria.findFirst({
              where: { id: l.entityId },
              select: { storyId: true },
            });
            if (ac) affectedStoryIds.add(ac.storyId);
          }
        }
      }

      await createNotificationsForWorkspace({
        workspaceId: source.workspaceId,
        type: "source_relevant",
        title: `New source may be relevant to ${pack.name}`,
        body: `'${source.name}' contains information relevant to ${affectedStoryIds.size} stories`,
        link: `/workspace/${source.workspaceId}/projects/${projectId}/packs/${pack.id}`,
        relatedPackId: pack.id,
        relatedSourceId: sourceId,
        preferenceKey: "notifySourceChanges",
      });
    }

    return { sourceId, status: "completed" };
  }
);
