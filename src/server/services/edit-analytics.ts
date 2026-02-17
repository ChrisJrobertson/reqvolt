import { db } from "@/server/db";

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

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function diceCoefficient(a: string, b: string): number {
  const aN = normalise(a);
  const bN = normalise(b);
  if (!aN || !bN) return 0;
  if (aN === bN) return 1;
  const makeBigrams = (input: string) =>
    new Set(Array.from({ length: Math.max(0, input.length - 1) }, (_, i) => input.slice(i, i + 2)));
  const aBigrams = makeBigrams(aN);
  const bBigrams = makeBigrams(bN);
  let intersection = 0;
  for (const gram of aBigrams) {
    if (bBigrams.has(gram)) intersection += 1;
  }
  return (2 * intersection) / (aBigrams.size + bBigrams.size || 1);
}

function storySignature(story: { persona: string; want: string }): string {
  return `${normalise(story.persona)}|${normalise(story.want)}`;
}

function acSignature(ac: { given: string; when: string; then: string }): string {
  return `${normalise(ac.given)}|${normalise(ac.when)}|${normalise(ac.then)}`;
}

export async function computeEditAnalytics(packId: string): Promise<EditAnalytics> {
  const versions = await db.packVersion.findMany({
    where: { packId },
    orderBy: { versionNumber: "asc" },
    include: {
      stories: {
        where: { deletedAt: null },
        include: {
          acceptanceCriteria: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (versions.length === 0) {
    throw new Error("Pack has no versions");
  }

  const first = versions[0]!;
  const latest = versions[versions.length - 1]!;

  const latestRemaining = new Set(latest.stories.map((story) => story.id));
  const matchedStories = new Map<string, string>();

  for (const storyA of first.stories) {
    let bestStoryId: string | null = null;
    let bestScore = 0;
    for (const storyB of latest.stories) {
      if (!latestRemaining.has(storyB.id)) continue;
      const score = diceCoefficient(storySignature(storyA), storySignature(storyB));
      if (score > bestScore) {
        bestScore = score;
        bestStoryId = storyB.id;
      }
    }
    if (bestStoryId && bestScore > 0.85) {
      matchedStories.set(storyA.id, bestStoryId);
      latestRemaining.delete(bestStoryId);
    }
  }

  const storiesDeleted = first.stories.length - matchedStories.size;
  const storiesAdded = latest.stories.length - matchedStories.size;

  const firstAcIds = first.stories.flatMap((story) => story.acceptanceCriteria.map((ac) => ac.id));
  const latestAcIds = latest.stories.flatMap((story) => story.acceptanceCriteria.map((ac) => ac.id));
  const [firstEvidence, latestEvidence] = await Promise.all([
    db.evidenceLink.findMany({
      where: { entityType: "acceptance_criteria", entityId: { in: firstAcIds } },
      select: { entityId: true, sourceChunkId: true },
    }),
    db.evidenceLink.findMany({
      where: { entityType: "acceptance_criteria", entityId: { in: latestAcIds } },
      select: { entityId: true, sourceChunkId: true },
    }),
  ]);

  const evidenceByAcFirst = firstEvidence.reduce(
    (acc, link) => {
      const current = acc[link.entityId] ?? new Set<string>();
      current.add(link.sourceChunkId);
      acc[link.entityId] = current;
      return acc;
    },
    {} as Record<string, Set<string>>
  );
  const evidenceByAcLatest = latestEvidence.reduce(
    (acc, link) => {
      const current = acc[link.entityId] ?? new Set<string>();
      current.add(link.sourceChunkId);
      acc[link.entityId] = current;
      return acc;
    },
    {} as Record<string, Set<string>>
  );

  let storiesModified = 0;
  let acsRewritten = 0;
  let acsDeleted = 0;
  let acsAdded = 0;
  let evidenceLinksRemoved = 0;
  let unchangedStories = 0;

  const latestById = new Map(latest.stories.map((story) => [story.id, story]));

  for (const storyA of first.stories) {
    const matchedId = matchedStories.get(storyA.id);
    if (!matchedId) continue;
    const storyB = latestById.get(matchedId)!;

    const storyChanged =
      normalise(storyA.persona) !== normalise(storyB.persona) ||
      normalise(storyA.want) !== normalise(storyB.want) ||
      normalise(storyA.soThat) !== normalise(storyB.soThat);

    const bRemaining = new Set(storyB.acceptanceCriteria.map((ac) => ac.id));
    const acMatches = new Map<string, string>();
    for (const acA of storyA.acceptanceCriteria) {
      let bestAcId: string | null = null;
      let bestScore = 0;
      for (const acB of storyB.acceptanceCriteria) {
        if (!bRemaining.has(acB.id)) continue;
        const score = diceCoefficient(acSignature(acA), acSignature(acB));
        if (score > bestScore) {
          bestScore = score;
          bestAcId = acB.id;
        }
      }
      if (bestAcId && bestScore > 0.85) {
        acMatches.set(acA.id, bestAcId);
        bRemaining.delete(bestAcId);
      }
    }

    acsDeleted += storyA.acceptanceCriteria.length - acMatches.size;
    acsAdded += storyB.acceptanceCriteria.length - acMatches.size;

    let acChangedForStory = false;
    for (const acA of storyA.acceptanceCriteria) {
      const matchAcId = acMatches.get(acA.id);
      if (!matchAcId) continue;
      const acB = storyB.acceptanceCriteria.find((item) => item.id === matchAcId)!;
      const rewritten =
        normalise(acA.given) !== normalise(acB.given) ||
        normalise(acA.when) !== normalise(acB.when) ||
        normalise(acA.then) !== normalise(acB.then);
      if (rewritten) {
        acChangedForStory = true;
        acsRewritten += 1;
      }

      const beforeEvidence = evidenceByAcFirst[acA.id] ?? new Set<string>();
      const afterEvidence = evidenceByAcLatest[acB.id] ?? new Set<string>();
      for (const sourceChunkId of beforeEvidence) {
        if (!afterEvidence.has(sourceChunkId)) {
          evidenceLinksRemoved += 1;
        }
      }
    }

    if (storyChanged || acChangedForStory) {
      storiesModified += 1;
    } else {
      unchangedStories += 1;
    }
  }

  const unchangedRate = first.stories.length
    ? Math.round((unchangedStories / first.stories.length) * 100)
    : 0;

  return {
    packId,
    version1Id: first.id,
    latestVersionId: latest.id,
    storiesDeleted,
    storiesAdded,
    storiesModified,
    acsRewritten,
    acsDeleted,
    acsAdded,
    evidenceLinksRemoved,
    unchangedRate,
    generatedAt: first.createdAt,
    analysedAt: new Date(),
  };
}
