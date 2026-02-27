import { getAuthUserId } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { auditService } from "@/server/services/audit";
import { buildDocx } from "@/server/services/docx-export";
import { buildCsv } from "@/server/services/csv-export";
import { buildHtml } from "@/server/services/html-export";
import { buildJson } from "@/server/services/json-export";

export const dynamic = "force-dynamic";

const FORMATS = ["docx", "csv", "html", "json"] as const;
type ExportFormat = (typeof FORMATS)[number];

function isValidFormat(s: string | null): s is ExportFormat {
  return s !== null && FORMATS.includes(s as ExportFormat);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ packId: string; versionId: string }> }
) {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packId, versionId } = await params;
  const formatParam = req.nextUrl.searchParams.get("format");
  const format: ExportFormat = isValidFormat(formatParam) ? formatParam : "docx";

  const version = await db.packVersion.findFirst({
    where: { id: versionId, packId },
    include: {
      pack: {
        include: {
          project: true,
        },
      },
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
      qaFlags: true,
    },
  });

  if (!version) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const member = await db.workspaceMember.findFirst({
    where: {
      workspaceId: version.pack.workspaceId,
      userId,
    },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sourceIds = (version.sourceIds as string[]) ?? [];
  const sources = await db.source.findMany({
    where: { id: { in: sourceIds } },
    select: { name: true },
  });
  const sourceNames = sources.map((s) => s.name);

  const storyIds = version.stories.map((s) => s.id);
  const acIds = version.stories.flatMap((s) =>
    s.acceptanceCriteria.map((ac) => ac.id)
  );
  const evidenceLinks = await db.evidenceLink.findMany({
    where: {
      OR: [
        { entityType: "story", entityId: { in: storyIds } },
        { entityType: "acceptance_criteria", entityId: { in: acIds } },
      ],
    },
    include: {
      sourceChunk: {
        include: { source: { select: { name: true } } },
      },
    },
  });

  const evidenceByEntity = new Map<string, string[]>();
  for (const el of evidenceLinks) {
    const name = el.sourceChunk.source?.name ?? "Unknown";
    const existing = evidenceByEntity.get(el.entityId) ?? [];
    if (!existing.includes(name)) existing.push(name);
    evidenceByEntity.set(el.entityId, existing);
  }

  const storyEvidenceCount = new Map<string, number>();
  for (const el of evidenceLinks) {
    if (el.entityType === "story") {
      storyEvidenceCount.set(el.entityId, (storyEvidenceCount.get(el.entityId) ?? 0) + 1);
    }
  }

  const qaPass = version.qaFlags.filter((f) => f.resolvedBy === "fixed").length;
  const qaUnresolved = version.qaFlags.filter((f) => !f.resolvedBy);
  const qaWarn = qaUnresolved.filter((f) => f.severity === "medium" || f.severity === "low").length;
  const qaFail = qaUnresolved.filter((f) => f.severity === "high").length;

  const baseFilename = version.pack.name.replace(/[^a-z0-9]/gi, "_");
  const versionNum = version.versionNumber;
  const generationDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const packData = {
    summary: version.summary,
    nonGoals: version.nonGoals,
    openQuestions: (version.openQuestions as string[]) ?? [],
    assumptions: (version.assumptions as string[]) ?? [],
    decisions: (version.decisions as string[]) ?? [],
    risks: (version.risks as string[]) ?? [],
    stories: version.stories.map((s) => ({
      id: s.id,
      persona: s.persona,
      want: s.want,
      soThat: s.soThat,
      acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
        id: ac.id,
        given: ac.given,
        when: ac.when,
        then: ac.then,
      })),
      evidenceSources: evidenceByEntity.get(s.id) ?? [],
      evidenceCount: storyEvidenceCount.get(s.id) ?? 0,
      evidenceLinks: evidenceLinks
        .filter((el) => el.entityType === "story" && el.entityId === s.id)
        .map((el) => ({ sourceChunkId: el.sourceChunkId, confidence: el.confidence })),
      qaFlags: version.qaFlags
        .filter((f) => f.entityType === "story" && f.entityId === s.id)
        .map((f) => ({ ruleCode: f.ruleCode, severity: f.severity, message: f.message })),
    })),
  };

  let buffer: Buffer;
  let contentType: string;
  let filename: string;

  const docxData = {
    summary: packData.summary,
    nonGoals: packData.nonGoals,
    openQuestions: packData.openQuestions,
    assumptions: packData.assumptions,
    decisions: packData.decisions,
    risks: packData.risks,
    stories: packData.stories.map((s) => ({
      persona: s.persona,
      want: s.want,
      soThat: s.soThat,
      acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
        given: ac.given,
        when: ac.when,
        then: ac.then,
      })),
    })),
  };

  switch (format) {
    case "docx":
      buffer = await buildDocx(
        version.pack.name,
        version.pack.project.name,
        versionNum,
        docxData
      );
      contentType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      filename = `${baseFilename}_v${versionNum}.docx`;
      break;
    case "csv":
      buffer = buildCsv({
        packName: version.pack.name,
        projectName: version.pack.project.name,
        clientName: version.pack.project.clientName,
        versionNumber: versionNum,
        sourceNames,
        generationDate,
        data: {
          summary: packData.summary,
          nonGoals: packData.nonGoals,
          openQuestions: packData.openQuestions,
          assumptions: packData.assumptions,
          decisions: packData.decisions,
          risks: packData.risks,
          stories: packData.stories.map((s) => ({
            id: s.id,
            persona: s.persona,
            want: s.want,
            soThat: s.soThat,
            acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
              given: ac.given,
              when: ac.when,
              then: ac.then,
            })),
            evidenceSources: s.evidenceSources,
          })),
        },
      });
      contentType = "text/csv; charset=utf-8";
      filename = `${baseFilename}_v${versionNum}.csv`;
      break;
    case "html":
      buffer = buildHtml({
        packName: version.pack.name,
        projectName: version.pack.project.name,
        clientName: version.pack.project.clientName,
        versionNumber: versionNum,
        sourceNames,
        generationDate,
        data: {
          summary: packData.summary,
          nonGoals: packData.nonGoals,
          openQuestions: packData.openQuestions,
          assumptions: packData.assumptions,
          decisions: packData.decisions,
          risks: packData.risks,
          stories: packData.stories.map((s) => ({
            id: s.id,
            persona: s.persona,
            want: s.want,
            soThat: s.soThat,
            acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
              given: ac.given,
              when: ac.when,
              then: ac.then,
            })),
            evidenceCount: s.evidenceCount,
          })),
        },
        qaStats: { pass: qaPass, warn: qaWarn, fail: qaFail },
      });
      contentType = "text/html; charset=utf-8";
      filename = `${baseFilename}_v${versionNum}.html`;
      break;
    case "json":
      buffer = buildJson({
        packId: version.pack.id,
        packVersionId: version.id,
        packName: version.pack.name,
        projectName: version.pack.project.name,
        clientName: version.pack.project.clientName,
        versionNumber: versionNum,
        sourceIds,
        sourceNames,
        healthScore: version.pack.healthScore,
        healthStatus: version.pack.healthStatus,
        data: {
          summary: packData.summary,
          nonGoals: packData.nonGoals,
          openQuestions: packData.openQuestions,
          assumptions: packData.assumptions,
          decisions: packData.decisions,
          risks: packData.risks,
          stories: packData.stories.map((s) => ({
            id: s.id,
            persona: s.persona,
            want: s.want,
            soThat: s.soThat,
            acceptanceCriteria: s.acceptanceCriteria,
            evidenceLinks: s.evidenceLinks,
            qaFlags: s.qaFlags,
          })),
        },
      });
      contentType = "application/json; charset=utf-8";
      filename = `${baseFilename}_v${versionNum}.json`;
      break;
  }

  await auditService.log({
    workspaceId: version.pack.workspaceId,
    userId,
    action: "pack_exported",
    entityType: "Pack",
    entityId: packId,
    metadata: { format, packId, versionId },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
