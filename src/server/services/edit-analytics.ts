/**
 * Edit analytics: compares v1 (initial generated) to latest version
 * to understand what users change after generation.
 */
import { db } from "../db";

export interface EditAnalytics {
  packId: string;
  version1Id: string;
  latestVersionId: string;
  storiesDeleted: number;
  storiesAdded: number;
  storiesModified: number;
  acsRewritten: number;
  acsDeleted: number;
  acsAdded: number;
  evidenceLinksRemoved: number;
  unchangedRate: number;
  generatedAt: Date;
  analysedAt: Date;
}

function storyKey(s: { persona: string; want: string }): string {
  return `${s.persona}|${s.want}`.toLowerCase();
}

function acKey(ac: { given: string; when: string; then: string }): string {
  return `${ac.given}|${ac.when}|${ac.then}`.toLowerCase();
}

export async function computeEditAnalytics(packId: string): Promise<EditAnalytics | null> {
  const versions = await db.packVersion.findMany({
    where: { packId },
    orderBy: { versionNumber: "asc" },
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
  });

  if (versions.length < 2) return null;

  const v1 = versions[0]!;
  const latest = versions[versions.length - 1]!;

  const v1Stories = v1.stories;
  const latestStories = latest.stories;

  const v1Keys = new Set(v1Stories.map((s) => storyKey(s)));
  const latestKeys = new Set(latestStories.map((s) => storyKey(s)));

  let storiesDeleted = 0;
  let storiesAdded = 0;
  let storiesModified = 0;

  for (const s of v1Stories) {
    const key = storyKey(s);
    if (!latestKeys.has(key)) {
      storiesDeleted++;
    } else {
      const match = latestStories.find((ls) => storyKey(ls) === key);
      if (match && (s.soThat !== match.soThat || s.persona !== match.persona || s.want !== match.want)) {
        storiesModified++;
      }
    }
  }
  for (const s of latestStories) {
    if (!v1Keys.has(storyKey(s))) storiesAdded++;
  }

  let acsRewritten = 0;
  let acsDeleted = 0;
  let acsAdded = 0;

  const latestStoryMap = new Map(latestStories.map((s) => [storyKey(s), s]));

  for (const s of v1Stories) {
    const key = storyKey(s);
    const latestStory = latestStoryMap.get(key);
    if (!latestStory) continue;

    const v1AcKeys = new Set(s.acceptanceCriteria.map((ac) => acKey(ac)));
    const latestAcKeys = new Set(latestStory.acceptanceCriteria.map((ac) => acKey(ac)));

    for (const ac of s.acceptanceCriteria) {
      const acK = acKey(ac);
      if (!latestAcKeys.has(acK)) acsDeleted++;
      else {
        const match = latestStory.acceptanceCriteria.find((la) => acKey(la) === acK);
        if (match && (ac.given !== match.given || ac.when !== match.when || ac.then !== match.then)) {
          acsRewritten++;
        }
      }
    }
    for (const ac of latestStory.acceptanceCriteria) {
      if (!v1AcKeys.has(acKey(ac))) acsAdded++;
    }
  }

  const v1AcIds = v1Stories.flatMap((s) => s.acceptanceCriteria.map((ac) => ac.id));
  const latestAcIds = latestStories.flatMap((s) => s.acceptanceCriteria.map((ac) => ac.id));

  const v1EvidenceCount = await db.evidenceLink.count({
    where: {
      entityType: "acceptance_criteria",
      entityId: { in: v1AcIds },
    },
  });
  const latestEvidenceCount = await db.evidenceLink.count({
    where: {
      entityType: "acceptance_criteria",
      entityId: { in: latestAcIds },
    },
  });
  const evidenceLinksRemoved = Math.max(0, v1EvidenceCount - latestEvidenceCount);

  const unchangedStories = v1Stories.filter((s) => {
    const key = storyKey(s);
    const ls = latestStoryMap.get(key);
    if (!ls) return false;
    if (s.persona !== ls.persona || s.want !== ls.want || s.soThat !== ls.soThat) return false;
    const v1AcSet = new Set(s.acceptanceCriteria.map((ac) => acKey(ac)));
    const latestAcSet = new Set(ls.acceptanceCriteria.map((ac) => acKey(ac)));
    if (v1AcSet.size !== latestAcSet.size) return false;
    for (const ac of ls.acceptanceCriteria) {
      if (!v1AcSet.has(acKey(ac))) return false;
      const v1Ac = s.acceptanceCriteria.find((a) => acKey(a) === acKey(ac));
      if (!v1Ac || v1Ac.given !== ac.given || v1Ac.when !== ac.when || v1Ac.then !== ac.then) return false;
    }
    return true;
  });
  const unchangedRate = v1Stories.length > 0 ? (unchangedStories.length / v1Stories.length) * 100 : 100;

  return {
    packId,
    version1Id: v1.id,
    latestVersionId: latest.id,
    storiesDeleted,
    storiesAdded,
    storiesModified,
    acsRewritten,
    acsDeleted,
    acsAdded,
    evidenceLinksRemoved,
    unchangedRate,
    generatedAt: v1.createdAt,
    analysedAt: new Date(),
  };
}
