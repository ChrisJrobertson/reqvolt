import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { auditService } from "@/server/services/audit";
import { ApprovalRequestStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const req = await db.approvalRequest.findUnique({
    where: { token },
    include: {
      pack: { include: { project: true } },
      packVersion: {
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

  if (!req || req.status !== ApprovalRequestStatus.pending) {
    return NextResponse.json(
      { error: "Approval link not found or already used" },
      { status: 404 }
    );
  }

  if (req.dueDate && new Date() > req.dueDate) {
    await db.approvalRequest.update({
      where: { id: req.id },
      data: { status: ApprovalRequestStatus.expired },
    });
    return NextResponse.json({ error: "Approval link has expired" }, { status: 410 });
  }

  return NextResponse.json({
    packName: req.pack.name,
    projectName: req.pack.project.name,
    versionNumber: req.packVersion.versionNumber,
    summary: req.packVersion.summary,
    nonGoals: req.packVersion.nonGoals,
    stories: req.packVersion.stories.map((s) => ({
      id: s.id,
      persona: s.persona,
      want: s.want,
      soThat: s.soThat,
      acceptanceCriteria: s.acceptanceCriteria,
    })),
    approvalScope: req.approvalScope,
    dueDate: req.dueDate,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const action = body?.action as string | undefined;
  const signatureName = body?.signatureName as string | undefined;
  const comments = body?.comments as string | undefined;

  const approvalReq = await db.approvalRequest.findUnique({
    where: { token },
    include: { pack: true },
  });

  if (!approvalReq || approvalReq.status !== ApprovalRequestStatus.pending) {
    return NextResponse.json(
      { error: "Approval link not found or already used" },
      { status: 404 }
    );
  }

  if (approvalReq.dueDate && new Date() > approvalReq.dueDate) {
    await db.approvalRequest.update({
      where: { id: approvalReq.id },
      data: { status: ApprovalRequestStatus.expired },
    });
    return NextResponse.json({ error: "Approval link has expired" }, { status: 410 });
  }

  if (action === "approve") {
    await db.approvalRequest.update({
      where: { id: approvalReq.id },
      data: {
        status: ApprovalRequestStatus.approved,
        signatureName: signatureName ?? approvalReq.approverName,
        approvedAt: new Date(),
      },
    });
  } else if (action === "request_changes") {
    await db.approvalRequest.update({
      where: { id: approvalReq.id },
      data: {
        status: ApprovalRequestStatus.changes_requested,
        rejectionReason: comments ?? "",
      },
    });
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const allReqs = await db.approvalRequest.findMany({
    where: { packId: approvalReq.packId },
  });
  const allApproved = allReqs.every((r) => r.status === ApprovalRequestStatus.approved);
  if (allApproved) {
    await db.pack.update({
      where: { id: approvalReq.packId },
      data: { reviewStatus: "approved" },
    });
  }

  await auditService.log({
    workspaceId: approvalReq.workspaceId,
    userId: approvalReq.approverEmail,
    action: "pack_approval_recorded",
    entityType: "Pack",
    entityId: approvalReq.packId,
    metadata: { action, approvalRequestId: approvalReq.id },
  });

  return NextResponse.json({ ok: true });
}
