/**
 * Data retention and SAR export service.
 */
import { db } from "../db";
import crypto from "node:crypto";

const RECOVERY_WINDOW_DAYS = 30;

export async function applyRetentionPolicy(workspaceId: string): Promise<number> {
  const ws = await db.workspace.findFirst({
    where: { id: workspaceId, retentionEnabled: true },
  });
  if (!ws) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ws.retentionAutoArchiveDays);

  const projects = await db.project.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      deletedAt: null,
      exemptFromRetention: false,
      updatedAt: { lt: cutoff },
    },
  });

  for (const p of projects) {
    await db.project.update({
      where: { id: p.id },
      data: { archivedAt: new Date() },
    });
  }
  return projects.length;
}

export async function purgeExpiredProjects(workspaceId: string): Promise<number> {
  const ws = await db.workspace.findFirst({
    where: { id: workspaceId, retentionEnabled: true },
  });
  if (!ws) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ws.retentionAutoDeleteDays);

  const toPurge = await db.project.findMany({
    where: {
      workspaceId,
      deletedAt: { lt: cutoff, not: null },
      exemptFromRetention: false,
    },
  });

  for (const p of toPurge) {
    await db.project.delete({ where: { id: p.id } });
  }
  return toPurge.length;
}

export async function softDeleteProject(projectId: string): Promise<void> {
  await db.project.update({
    where: { id: projectId },
    data: { deletedAt: new Date(), archivedAt: new Date() },
  });
}

export async function recoverProject(projectId: string): Promise<boolean> {
  const project = await db.project.findFirst({
    where: { id: projectId },
    select: { deletedAt: true },
  });
  if (!project?.deletedAt) return false;

  const windowEnd = new Date(project.deletedAt);
  windowEnd.setDate(windowEnd.getDate() + RECOVERY_WINDOW_DAYS);
  if (new Date() > windowEnd) return false;

  await db.project.update({
    where: { id: projectId },
    data: { deletedAt: null, archivedAt: null },
  });
  return true;
}

export async function redactEvidence(chunkId: string, userId: string): Promise<void> {
  await db.sourceChunk.update({
    where: { id: chunkId },
    data: {
      content: "[REDACTED]",
      redactedAt: new Date(),
      redactedBy: userId,
    },
  });
}

export async function exportAllProjectData(
  projectId: string,
  workspaceId: string
): Promise<Buffer> {
  const project = await db.project.findFirst({
    where: { id: projectId, workspaceId },
    include: {
      sources: { where: { deletedAt: null } },
      packs: {
        include: {
          versions: {
            orderBy: { versionNumber: "desc" },
            take: 1,
            include: {
              stories: {
                where: { deletedAt: null },
                include: {
                  acceptanceCriteria: { where: { deletedAt: null } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!project) throw new Error("Project not found");

  const chunks = await db.sourceChunk.findMany({
    where: { source: { projectId } },
    include: { source: { select: { name: true } } },
  });

  const evidenceItems = chunks.map((c) => ({
    id: c.id,
    sourceName: c.source.name,
    content: c.redactedAt ? "[REDACTED]" : c.content,
    redactedAt: c.redactedAt,
    redactedBy: c.redactedBy,
  }));

  const baselines = await db.baseline.findMany({
    where: { pack: { projectId } },
    orderBy: { versionNumber: "desc" },
  });

  const auditLogs = await db.auditLog.findMany({
    where: {
      workspaceId,
      metadata: { path: ["projectId"], equals: projectId },
    },
    orderBy: { createdAt: "asc" },
  });

  const packsData = project.packs.map((p) => ({
    id: p.id,
    name: p.name,
    versions: p.versions.map((v) => ({
      versionNumber: v.versionNumber,
      stories: v.stories.map((s) => ({
        id: s.id,
        persona: s.persona,
        want: s.want,
        soThat: s.soThat,
        acceptanceCriteria: s.acceptanceCriteria,
      })),
    })),
  }));

  const sourcesData = project.sources.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
  }));

  const evidenceJson = JSON.stringify(evidenceItems, null, 2);
  const packsJson = JSON.stringify(packsData, null, 2);
  const baselinesJson = JSON.stringify(
    baselines.map((b) => ({ id: b.id, versionLabel: b.versionLabel, snapshotData: b.snapshotData })),
    null,
    2
  );

  const auditCsv =
    "timestamp,userId,action,entityType,entityId\n" +
    auditLogs
      .map(
        (a) =>
          `${a.createdAt.toISOString()},${a.userId},${a.action},${a.entityType},${a.entityId ?? ""}`
      )
      .join("\n");

  const manifest = {
    exportedAt: new Date().toISOString(),
    projectId,
    fileList: ["evidence.json", "packs.json", "baselines.json", "audit-log.csv", "sources.json"],
    sha256Hashes: {} as Record<string, string>,
  };

  const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  manifest.sha256Hashes["evidence.json"] = hash(evidenceJson);
  manifest.sha256Hashes["packs.json"] = hash(packsJson);
  manifest.sha256Hashes["baselines.json"] = hash(baselinesJson);
  manifest.sha256Hashes["audit-log.csv"] = hash(auditCsv);
  manifest.sha256Hashes["sources.json"] = hash(JSON.stringify(sourcesData));

  const archiver = await import("archiver");

  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    const archive = archiver.default("zip", { zlib: { level: 9 } });
    archive.on("data", (chunk: Buffer) => buffers.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(buffers)));
    archive.on("error", reject);

    archive.append(evidenceJson, { name: "evidence.json" });
    archive.append(packsJson, { name: "packs.json" });
    archive.append(baselinesJson, { name: "baselines.json" });
    archive.append(auditCsv, { name: "audit-log.csv" });
    archive.append(JSON.stringify(sourcesData, null, 2), { name: "sources.json" });
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    archive.finalize();
  });
}
