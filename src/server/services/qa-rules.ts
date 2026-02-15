/**
 * QA Rules Engine - Deterministic, no LLM.
 * Rules: VAGUE_TERM, UNTESTABLE, OVERLOADED_AC, MISSING_CLAUSE
 */
import { db } from "../db";

const VAGUE_TERMS = [
  "fast",
  "easy",
  "seamless",
  "optimise",
  "optimize",
  "efficient",
  "user-friendly",
  "user friendly",
  "quick",
  "simple",
  "intuitive",
];

const UNTESTABLE_PHRASES = [
  "should",
  "as needed",
  "etc.",
  "etc",
  "when appropriate",
  "if necessary",
  "as required",
  "where possible",
  "if applicable",
];

function findVagueTerms(text: string): string[] {
  const lower = text.toLowerCase();
  return VAGUE_TERMS.filter((term) => {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return regex.test(lower);
  });
}

function findUntestablePhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return UNTESTABLE_PHRASES.filter((phrase) => lower.includes(phrase));
}

function checkOverloadedAC(given: string, when: string, then: string): boolean {
  const full = `${given} ${when} ${then}`;
  const andCount = (full.match(/\band\b/gi) ?? []).length;
  const thenCount = (full.match(/\bthen\b/gi) ?? []).length;
  return full.split(/\s+/).length > 50 || andCount >= 2 || thenCount >= 2;
}

function checkMissingClause(given: string, when: string, then: string): boolean {
  const g = given?.trim() ?? "";
  const w = when?.trim() ?? "";
  const t = then?.trim() ?? "";
  return g.length === 0 || w.length === 0 || t.length === 0;
}

export async function runQARules(packVersionId: string): Promise<number> {
  const version = await db.packVersion.findFirst({
    where: { id: packVersionId },
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

  if (!version) throw new Error("Pack version not found");

  await db.qAFlag.deleteMany({ where: { packVersionId } });

  let flagCount = 0;

  for (const story of version.stories) {
    const storyText = `${story.persona} ${story.want} ${story.soThat}`;

    for (const term of findVagueTerms(storyText)) {
      await db.qAFlag.create({
        data: {
          packVersionId,
          entityType: "story",
          entityId: story.id,
          ruleCode: "VAGUE_TERM",
          severity: "medium",
          message: `Vague term "${term}" - consider replacing with measurable language`,
        },
      });
      flagCount++;
    }

    for (const phrase of findUntestablePhrases(storyText)) {
      await db.qAFlag.create({
        data: {
          packVersionId,
          entityType: "story",
          entityId: story.id,
          ruleCode: "UNTESTABLE",
          severity: "high",
          message: `Untestable phrase "${phrase}" - make criteria verifiable`,
        },
      });
      flagCount++;
    }

    for (const ac of story.acceptanceCriteria) {
      const acText = `${ac.given} ${ac.when} ${ac.then}`;

      for (const term of findVagueTerms(acText)) {
        await db.qAFlag.create({
          data: {
            packVersionId,
            entityType: "acceptance_criteria",
            entityId: ac.id,
            ruleCode: "VAGUE_TERM",
            severity: "medium",
            message: `Vague term "${term}" in acceptance criterion`,
          },
        });
        flagCount++;
      }

      for (const phrase of findUntestablePhrases(acText)) {
        await db.qAFlag.create({
          data: {
            packVersionId,
            entityType: "acceptance_criteria",
            entityId: ac.id,
            ruleCode: "UNTESTABLE",
            severity: "high",
            message: `Untestable phrase "${phrase}" - make verifiable`,
          },
        });
        flagCount++;
      }

      if (checkMissingClause(ac.given, ac.when, ac.then)) {
        const missing: string[] = [];
        if (!ac.given?.trim()) missing.push("Given");
        if (!ac.when?.trim()) missing.push("When");
        if (!ac.then?.trim()) missing.push("Then");
        await db.qAFlag.create({
          data: {
            packVersionId,
            entityType: "acceptance_criteria",
            entityId: ac.id,
            ruleCode: "MISSING_CLAUSE",
            severity: "high",
            message: `Missing: ${missing.join(", ")}`,
          },
        });
        flagCount++;
      }

      if (checkOverloadedAC(ac.given, ac.when, ac.then)) {
        await db.qAFlag.create({
          data: {
            packVersionId,
            entityType: "acceptance_criteria",
            entityId: ac.id,
            ruleCode: "OVERLOADED_AC",
            severity: "medium",
            message: "Acceptance criterion too long or has multiple AND/THEN - consider splitting",
          },
        });
        flagCount++;
      }
    }
  }

  return flagCount;
}
