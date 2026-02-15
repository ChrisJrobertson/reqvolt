/**
 * Text chunking for RAG pipeline.
 * Uses @langchain/textsplitters with 512 tokens, 50 overlap.
 */
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// ~512 tokens at ~4 chars per token
const CHUNK_SIZE = 2048;
const CHUNK_OVERLAP = 200;

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_SIZE,
  chunkOverlap: CHUNK_OVERLAP,
  separators: ["\n\n", "\n", ". ", " ", ""],
});

export interface ChunkResult {
  content: string;
  tokenCount: number;
  chunkIndex: number;
}

export async function chunkText(text: string): Promise<ChunkResult[]> {
  const chunks = await splitter.createDocuments([text]);
  return chunks.map((chunk, i) => ({
    content: chunk.pageContent,
    tokenCount: Math.ceil(chunk.pageContent.length / 4),
    chunkIndex: i,
  }));
}
