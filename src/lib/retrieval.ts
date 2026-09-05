import type { TranscriptSegment } from "./types";

export type RetrievedSegment = TranscriptSegment & { score: number };

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "his", "how", "i", "in", "is",
  "it", "its", "of", "on", "or", "she", "so", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "why", "will", "with", "you", "your",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * BM25 over the transcript segments. A lecture is a few dozen passages, so
 * scoring them all per question is cheaper and more predictable than running
 * an embedding model, and it needs nothing at request time.
 */
export function retrieve(
  segments: TranscriptSegment[],
  question: string,
  limit = 5,
): RetrievedSegment[] {
  const queryTerms = tokenize(question);
  if (queryTerms.length === 0 || segments.length === 0) return [];

  const k1 = 1.5;
  const b = 0.75;

  const docs = segments.map((segment) => tokenize(segment.text));
  const averageLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length;

  const documentFrequency = new Map<string, number>();
  for (const term of new Set(queryTerms)) {
    documentFrequency.set(term, docs.filter((doc) => doc.includes(term)).length);
  }

  const scored = segments.map((segment, index) => {
    const doc = docs[index];
    const counts = new Map<string, number>();
    for (const token of doc) counts.set(token, (counts.get(token) ?? 0) + 1);

    let score = 0;
    for (const term of queryTerms) {
      const frequency = counts.get(term);
      if (!frequency) continue;

      const matching = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - matching + 0.5) / (matching + 0.5));
      const normalized = frequency * (k1 + 1);
      const denominator = frequency + k1 * (1 - b + (b * doc.length) / averageLength);
      score += idf * (normalized / denominator);
    }

    return { ...segment, score };
  });

  return scored
    .filter((segment) => segment.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
