/**
 * Public ingest API for projects.
 * Bearer auth via workspace API key. Rate limit 60/hr per key (Upstash).
 * Creates Source and triggers chunk-and-embed.
 */
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { inngest } from "@/server/inngest/client";
import { auditService } from "@/server/services/audit";
import { hashApiKey, validateApiKeyFormat } from "@/lib/api-keys";
import { apiRateLimit } from "@/lib/rate-limit";
import { SourceType } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 500 * 1024; // 500KB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const auth = request.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token || !validateApiKeyFormat(token)) {
      return NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 }
      );
    }

    const keyHash = hashApiKey(token);
    const apiKey = await db.apiKey.findFirst({
      where: { keyHash, isRevoked: false },
    });
    if (!apiKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const rateResult = await apiRateLimit(keyHash);
    if (!rateResult.success) {
      const retryAfter = Math.max(1, rateResult.reset - Math.floor(Date.now() / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    await db.apiKey.update({
      where: { id: apiKey.id },
      data: {
        lastUsedAt: new Date(),
        requestCount: { increment: 1 },
      },
    });

    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body too large (max 500KB)" },
        { status: 413 }
      );
    }

    const { projectId } = await params;
    const project = await db.project.findFirst({
      where: { id: projectId, workspaceId: apiKey.workspaceId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    let text: string;
    let name = "Ingested";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as unknown;
      if (typeof body === "object" && body !== null && "text" in body) {
        text = String((body as { text: unknown }).text ?? "");
        if ("name" in body && typeof (body as { name: unknown }).name === "string") {
          name = (body as { name: string }).name;
        }
      } else {
        text = JSON.stringify(body);
      }
    } else {
      text = await request.text();
    }

    const trimmed = text.trim();
    if (trimmed.length < 10) {
      return NextResponse.json(
        { error: "Content too short (minimum 10 characters)" },
        { status: 400 }
      );
    }

    const source = await db.source.create({
      data: {
        workspaceId: apiKey.workspaceId,
        projectId: project.id,
        type: SourceType.OTHER,
        name: name.slice(0, 255),
        content: trimmed,
        status: "completed",
      },
    });

    await inngest.send({
      name: "source/chunk-and-embed",
      data: {
        sourceId: source.id,
        workspaceId: apiKey.workspaceId,
        projectId: project.id,
      },
    });

    await auditService.log({
      workspaceId: apiKey.workspaceId,
      userId: apiKey.createdBy,
      action: "source.create",
      entityType: "Source",
      entityId: source.id,
      metadata: { type: "ingest_api", projectId: project.id },
    });

    return NextResponse.json(
      { sourceId: source.id, status: "created" },
      { status: 201 }
    );
  } catch (err) {
    console.error("[ingest] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
