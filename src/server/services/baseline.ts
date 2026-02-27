/**
 * Immutable baseline snapshots for packs.
 * A baseline is a frozen snapshot that cannot be edited.
 */
import { db } from "../db";

export interface SnapshotStory {
  id: string;
  sortOrder: number;
  persona: string;
  want: string;
  soThat: string;
  acceptanceCriteria: Array<{ id: string; given: string; when: string; then: string }>;
}

export interface BaselineSnapshot {
  stories: SnapshotStory[];
  evidenceLinks: Array<{ entityType: string; entityId: string; sourceChunkId: string }>;
  qaFlags: Array<{ entityType: string; entityId: string; ruleCode: string; message: string }>;
  healthScore: number | null;
  sources: string[];
  summary: string | null;
  nonGoals: string | null;
  assumptions: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
}

export interface BaselineDiff {
  addedStories: SnapshotStory[];
  removedStories: SnapshotStory[];
  modifiedStories: Array<{
    story: SnapshotStory;
    changes: Array<{ field: string; from: string; to: string }>;
  }>;
  addedEvidenceLinks: number;
  removedEvidenceLinks: number;
}

export async function createBaseline(
  packId: string,
  workspaceId: string,
  userId: string,
  note?: string
) {
  const pack = await db.pack.findFirst({
    where: { id: packId, workspaceId },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: {
          stories: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: {
              acceptanceCriteria: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!pack) throw new Error("Pack not found");
  const version = pack.versions[0];
  if (!version) throw new Error("Pack has no version");

  const evidenceLinks = await db.evidenceLink.findMany({
    where: {
      OR: [
        { entityType: "story", entityId: { in: version.stories.map((s) => s.id) } },
        { entityType: "acceptance_criteria", entityId: { in: version.stories.flatMap((s) => s.acceptanceCriteria.map((ac) => ac.id)) } },
      ],
    },
  });
  const qaFlags = await db.qAFlag.findMany({
    where: { packVersionId: version.id },
  });

  const snapshotData: BaselineSnapshot = {
    stories: version.stories.map((s) => ({
      id: s.id,
      sortOrder: s.sortOrder,
      persona: s.persona,
      want: s.want,
      soThat: s.soThat,
      acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
        id: ac.id,
        given: ac.given,
        when: ac.when,
        then: ac.then,
      })),
    })),
    evidenceLinks: evidenceLinks.map((el) => ({
      entityType: el.entityType,
      entityId: el.entityId,
      sourceChunkId: el.sourceChunkId,
    })),
    qaFlags: qaFlags.map((f: { entityType: string; entityId: string; ruleCode: string; message: string }) => ({
      entityType: f.entityType,
      entityId: f.entityId,
      ruleCode: f.ruleCode,
      message: f.message,
    })),
    healthScore: pack.healthScore,
    sources: ((version.sourceIds as string[]) ?? []).map(String),
    summary: version.summary,
    nonGoals: version.nonGoals,
    assumptions: (version.assumptions as string[]) ?? [],
    decisions: (version.decisions as string[]) ?? [],
    risks: (version.risks as string[]) ?? [],
    openQuestions: (version.openQuestions as string[]) ?? [],
  };

  const maxVersion = await db.baseline.aggregate({
    where: { packId },
    _max: { versionNumber: true },
  });
  const versionNumber = (maxVersion._max.versionNumber ?? 0) + 1;
  const versionLabel = `Baseline v${versionNumber}`;

  const baseline = await db.baseline.create({
    data: {
      workspaceId,
      packId,
      packVersionId: version.id,
      versionLabel,
      versionNumber,
      snapshotData: snapshotData as object,
      note: note ?? undefined,
      createdBy: userId,
    },
  });

  await db.pack.update({
    where: { id: packId },
    data: {
      lastBaselineId: baseline.id,
      divergedFromBaseline: false,
    },
  });

  return baseline;
}

export async function compareBaselines(
  baselineAId: string,
  baselineBId: string
): Promise<BaselineDiff> {
  const [a, b] = await Promise.all([
    db.baseline.findFirst({ where: { id: baselineAId } }),
    db.baseline.findFirst({ where: { id: baselineBId } }),
  ]);

  if (!a || !b) throw new Error("Baseline not found");

  const snapA = a.snapshotData as unknown as BaselineSnapshot;
  const snapB = b.snapshotData as unknown as BaselineSnapshot;

  const storiesA = new Map(snapA.stories.map((s) => [s.id, s]));
  const storiesB = new Map(snapB.stories.map((s) => [s.id, s]));

  const addedStories: SnapshotStory[] = [];
  const removedStories: SnapshotStory[] = [];
  const modifiedStories: BaselineDiff["modifiedStories"] = [];

  for (const s of snapB.stories) {
    const oldS = storiesA.get(s.id);
    if (!oldS) addedStories.push(s);
    else {
      const changes: Array<{ field: string; from: string; to: string }> = [];
      if (oldS.persona !== s.persona) changes.push({ field: "persona", from: oldS.persona, to: s.persona });
      if (oldS.want !== s.want) changes.push({ field: "want", from: oldS.want, to: s.want });
      if (oldS.soThat !== s.soThat) changes.push({ field: "soThat", from: oldS.soThat, to: s.soThat });
      const acA = JSON.stringify(oldS.acceptanceCriteria);
      const acB = JSON.stringify(s.acceptanceCriteria);
      if (acA !== acB) changes.push({ field: "acceptanceCriteria", from: acA.slice(0, 100), to: acB.slice(0, 100) });
      if (changes.length > 0) modifiedStories.push({ story: s, changes });
    }
  }
  for (const s of snapA.stories) {
    if (!storiesB.has(s.id)) removedStories.push(s);
  }

  const evidenceA = new Set(snapA.evidenceLinks.map((e) => `${e.entityId}:${e.sourceChunkId}`));
  const evidenceB = new Set(snapB.evidenceLinks.map((e) => `${e.entityId}:${e.sourceChunkId}`));
  let addedEvidenceLinks = 0;
  let removedEvidenceLinks = 0;
  for (const e of evidenceB) {
    if (!evidenceA.has(e)) addedEvidenceLinks++;
  }
  for (const e of evidenceA) {
    if (!evidenceB.has(e)) removedEvidenceLinks++;
  }

  return {
    addedStories,
    removedStories,
    modifiedStories,
    addedEvidenceLinks,
    removedEvidenceLinks,
  };
}
