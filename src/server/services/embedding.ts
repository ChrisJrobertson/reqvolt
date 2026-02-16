/**
 * OpenAI text-embedding-3-small for RAG.
 */
import OpenAI from "openai";
import { env } from "@/lib/env";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function embedText(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0]!.embedding;
}
