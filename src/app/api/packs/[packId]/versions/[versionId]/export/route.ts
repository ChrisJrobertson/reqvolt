import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { buildDocx } from "@/server/services/docx-export";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ packId: string; versionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { packId, versionId } = await params;

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

  const buffer = await buildDocx(
    version.pack.name,
    version.pack.project.name,
    version.versionNumber,
    {
      summary: version.summary,
      nonGoals: version.nonGoals,
      openQuestions: (version.openQuestions as string[]) ?? [],
      assumptions: (version.assumptions as string[]) ?? [],
      decisions: (version.decisions as string[]) ?? [],
      risks: (version.risks as string[]) ?? [],
      stories: version.stories.map((s) => ({
        persona: s.persona,
        want: s.want,
        soThat: s.soThat,
        acceptanceCriteria: s.acceptanceCriteria.map((ac) => ({
          given: ac.given,
          when: ac.when,
          then: ac.then,
        })),
      })),
    }
  );

  const filename = `${version.pack.name.replace(/[^a-z0-9]/gi, "_")}_v${version.versionNumber}.docx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
