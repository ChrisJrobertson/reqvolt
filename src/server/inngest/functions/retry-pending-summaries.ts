import { inngest } from "../client";
import { db } from "@/server/db";
import Anthropic from "@anthropic-ai/sdk";
import { getModelForTask } from "@/server/services/model-router";

const anthropic = new Anthropic();
const MAX_RETRIES = 5;
const BATCH_SIZE = 20;

export const retryPendingSummaries = inngest.createFunction(
  {
    id: "retry-pending-summaries",
    retries: 2,
  },
  { cron: "0 */2 * * *" },
  async () => {
    const impacts = await db.sourceChangeImpact.findMany({
      where: { summaryPending: true },
      take: BATCH_SIZE,
      include: {
        source: { select: { name: true } },
        pack: { select: { name: true } },
      },
    });

    let updated = 0;

    for (const impact of impacts) {
      if (impact.retryCount >= MAX_RETRIES) {
        await db.sourceChangeImpact.update({
          where: { id: impact.id },
          data: {
            summaryPending: false,
            impactSummary:
              "Source changes detected — review affected stories for accuracy.",
          },
        });
        updated++;
        continue;
      }

      try {
        const model = getModelForTask("impact-summary");
        const response = await anthropic.messages.create({
          model,
          max_tokens: 100,
          system:
            "Summarise how source changes affect requirements. One sentence, UK English.",
          messages: [
            {
              role: "user",
              content: `Source: ${impact.source.name}. Pack: ${impact.pack.name}. ${impact.affectedStoryCount} stories affected, ${impact.affectedAcCount} acceptance criteria. Severity: ${impact.severity}.`,
            },
          ],
        });

        const text = response.content.find((c) => c.type === "text");
        const summary =
          typeof text === "object" && "text" in text ? text.text : null;

        if (summary) {
          await db.sourceChangeImpact.update({
            where: { id: impact.id },
            data: {
              impactSummary: summary,
              summaryPending: false,
            },
          });
          updated++;
        } else {
          await db.sourceChangeImpact.update({
            where: { id: impact.id },
            data: { retryCount: impact.retryCount + 1 },
          });
        }
      } catch {
        await db.sourceChangeImpact.update({
          where: { id: impact.id },
          data: { retryCount: impact.retryCount + 1 },
        });
      }
    }

    return { processed: impacts.length, updated };
  }
);
