import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let extractor: any = null;

// Cache embeddings to avoid re-computing on every turn
// in a real prod scenario, this goes to sqlite.
const embeddingsCache = new Map<string, { hash: string, chunks: { text: string, vector: number[] }[] }>();

async function getExtractor() {
  if (!extractor) {
    // Distilbert or All-MiniLM-L6-v2 are great fast models
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += (chunkSize - overlap)) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  return chunks;
}

function cosineSimilarity(A: number[], B: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function getSemanticMatches(query: string, absolutePaths: string[], cwd: string, limit = 5) {
  const ext = await getExtractor();
  
  // Embed the query
  const queryOutput = await ext(query, { pooling: 'mean', normalize: true });
  const queryVector = Array.from(queryOutput.data) as number[];

  const allChunks: { filepath: string; snippet: string; score: number }[] = [];

  for (const file of absolutePaths) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const hash = crypto.createHash('md5').update(content).digest('hex');
      
      let cached = embeddingsCache.get(file);
      if (!cached || cached.hash !== hash) {
        // Re-process file
        const textChunks = chunkText(content);
        const vectors = [];
        for (const chunk of textChunks) {
          const out = await ext(chunk, { pooling: 'mean', normalize: true });
          vectors.push({ text: chunk, vector: Array.from(out.data) as number[] });
        }
        cached = { hash, chunks: vectors };
        embeddingsCache.set(file, cached);
      }

      // Compute distances
      for (const chunk of cached.chunks) {
        const score = cosineSimilarity(queryVector, chunk.vector);
        if (score > 0.3) { // minimum threshold
          allChunks.push({
            filepath: path.relative(cwd, file),
            snippet: chunk.text,
            score
          });
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  // Sort by score descending
  allChunks.sort((a, b) => b.score - a.score);
  return allChunks.slice(0, limit);
}
