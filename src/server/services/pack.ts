import { db } from "../db";

/**
 * Build evidence map for pack version: entityId -> EvidenceLink[]
 */
export async function getEvidenceMapForPackVersion(packVersionId: string) {
  const stories = await db.story.findMany({
    where: { packVersionId },
    select: { id: true },
  });
  const storyIds = stories.map((s) => s.id);

  const acs = await db.acceptanceCriteria.findMany({
    where: { storyId: { in: storyIds } },
    select: { id: true },
  });
  const acIds = acs.map((a) => a.id);

  const allEntityIds = [...storyIds, ...acIds];
  if (allEntityIds.length === 0) {
    return { story: {} as Record<string, never>, acceptance_criteria: {} as Record<string, never> };
  }

  const links = await db.evidenceLink.findMany({
    where: {
      entityId: { in: allEntityIds },
      entityType: { in: ["story", "acceptance_criteria"] },
    },
    include: { sourceChunk: { select: { content: true } } },
  });

  const story: Record<string, typeof links> = {};
  const acceptance_criteria: Record<string, typeof links> = {};

  for (const link of links) {
    const target = link.entityType === "story" ? story : acceptance_criteria;
    if (!target[link.entityId]) target[link.entityId] = [];
    target[link.entityId].push(link);
  }

  return { story, acceptance_criteria };
}

/**
 * Build evidence summary for a story (for Monday.com evidence column).
 */
export function getEvidenceSummaryForStory(
  evidenceMap: {
    story: Record<string, Array<{ confidence: string }>>;
    acceptance_criteria: Record<string, Array<{ confidence: string }>>;
  },
  storyId: string,
  acIds: string[]
): string {
  const storyLinks = evidenceMap.story[storyId] ?? [];
  const acLinks = acIds.flatMap((id) => evidenceMap.acceptance_criteria[id] ?? []);
  const all = [...storyLinks, ...acLinks];
  if (all.length === 0) return "No evidence linked";
  const high = all.filter((l) => l.confidence === "high").length;
  const medium = all.filter((l) => l.confidence === "medium").length;
  const low = all.filter((l) => l.confidence === "low").length;
  const parts: string[] = [];
  if (high) parts.push(`${high} high`);
  if (medium) parts.push(`${medium} medium`);
  if (low) parts.push(`${low} low`);
  return `${all.length} evidence links (${parts.join(", ")})`;
}
