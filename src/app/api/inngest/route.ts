import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { extractSourceText } from "@/server/inngest/functions/extract-source-text";
import { chunkAndEmbed } from "@/server/inngest/functions/chunk-and-embed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [extractSourceText, chunkAndEmbed],
});
