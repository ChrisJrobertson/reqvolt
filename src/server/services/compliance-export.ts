/**
 * Workspace-wide compliance export for enterprise audit.
 */
import { db } from "../db";
import crypto from "node:crypto";

export async function generateComplianceExport(workspaceId: string): Promise<Buffer> {
  const [workspace, projects, workspaceMembers, projectMembers, approvalRequests, auditLogs] =
    await Promise.all([
      db.workspace.findFirst({
        where: { id: workspaceId },
        select: {
          retentionEnabled: true,
          retentionAutoArchiveDays: true,
          retentionAutoDeleteDays: true,
        },
      }),
      db.project.findMany({
        where: { workspaceId, deletedAt: null },
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
      }),
      db.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true, email: true, role: true, invitedAt: true, joinedAt: true },
      }),
      db.projectMember.findMany({
        where: { project: { workspaceId } },
        select: {
          userId: true,
          projectId: true,
          role: true,
          assignedBy: true,
          createdAt: true,
        },
      }),
      db.approvalRequest.findMany({
        where: { workspaceId },
        select: {
          id: true,
          packId: true,
          approverEmail: true,
          status: true,
          approvedAt: true,
          signatureName: true,
          rejectionReason: true,
          createdAt: true,
        },
      }),
      db.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const retentionPolicy = workspace
    ? {
        retentionEnabled: workspace.retentionEnabled,
        retentionAutoArchiveDays: workspace.retentionAutoArchiveDays,
        retentionAutoDeleteDays: workspace.retentionAutoDeleteDays,
      }
    : {};

  const auditCsv =
    "timestamp,userId,action,entityType,entityId\n" +
    auditLogs
      .map(
        (a) =>
          `${a.createdAt.toISOString()},${a.userId},${a.action},${a.entityType},${a.entityId ?? ""}`
      )
      .join("\n");

  const accessRecords =
    "type,userId,email,role,projectId,assignedBy,assignedAt\n" +
    workspaceMembers
      .map(
        (m) =>
          `workspace,${m.userId},${m.email ?? ""},${m.role},,,${m.joinedAt?.toISOString() ?? ""}`
      )
      .join("\n") +
    "\n" +
    projectMembers
      .map(
        (m) =>
          `project,${m.userId},,,${m.role},${m.projectId},${m.assignedBy},${m.createdAt.toISOString()}`
      )
      .join("\n");

  const approvalRecords =
    "id,packId,approverEmail,status,approvedAt,signatureName,rejectionReason,createdAt\n" +
    approvalRequests
      .map(
        (a) =>
          `${a.id},${a.packId},${a.approverEmail},${a.status},${a.approvedAt?.toISOString() ?? ""},${a.signatureName ?? ""},${(a.rejectionReason ?? "").replace(/,/g, ";")},${a.createdAt.toISOString()}`
      )
      .join("\n");

  const fileContents: { name: string; content: string }[] = [
    { name: "audit-log.csv", content: auditCsv },
    { name: "access-records.csv", content: accessRecords },
    { name: "approval-records.csv", content: approvalRecords },
    { name: "retention-policy.json", content: JSON.stringify(retentionPolicy, null, 2) },
  ];

  for (const project of projects) {
    const chunks = await db.sourceChunk.findMany({
      where: { source: { projectId: project.id } },
      include: { source: { select: { name: true } } },
    });
    const baselines = await db.baseline.findMany({
      where: { pack: { projectId: project.id } },
      orderBy: { versionNumber: "desc" },
    });

    const evidenceItems = chunks.map((c) => ({
      id: c.id,
      sourceName: c.source.name,
      content: c.redactedAt ? "[REDACTED]" : c.content,
    }));

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

    const projectDir = `projects/${project.name.replace(/\s+/g, "-")}`;
    fileContents.push({
      name: `${projectDir}/sources.json`,
      content: JSON.stringify(sourcesData, null, 2),
    });
    fileContents.push({
      name: `${projectDir}/evidence.json`,
      content: JSON.stringify(evidenceItems, null, 2),
    });
    fileContents.push({
      name: `${projectDir}/packs.json`,
      content: JSON.stringify(packsData, null, 2),
    });
    fileContents.push({
      name: `${projectDir}/baselines.json`,
      content: JSON.stringify(baselines, null, 2),
    });
  }

  const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  const sha256Hashes: Record<string, string> = {};
  for (const f of fileContents) {
    sha256Hashes[f.name] = hash(f.content);
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    workspaceId,
    fileList: fileContents.map((f) => f.name),
    sha256Hashes,
    totalProjects: projects.length,
    totalUsers: workspaceMembers.length,
  };

  fileContents.push({
    name: "manifest.json",
    content: JSON.stringify(manifest, null, 2),
  });

  const archiverMod = await import("archiver");
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = [];
    const archive = archiverMod.default("zip", { zlib: { level: 9 } });
    archive.on("data", (chunk: Buffer) => buffers.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(buffers)));
    archive.on("error", reject);

    for (const f of fileContents) {
      archive.append(f.content, { name: f.name });
    }
    archive.finalize();
  });
}
