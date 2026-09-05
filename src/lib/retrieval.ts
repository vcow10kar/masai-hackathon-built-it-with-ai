import { activeSegmentIndex } from "./segments";
import type { TranscriptSegment } from "./types";

export type RetrievedSegment = TranscriptSegment & {
  score: number;
  /** True when the segment was pulled in because it sits at the playhead. */
  anchored?: boolean;
};

export type RetrieveOptions = {
  limit?: number;
  /** Where the student has the recording paused, in seconds. */
  atTime?: number | null;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "did", "do", "does",
  "for", "from", "had", "has", "have", "he", "her", "his", "how", "i", "in", "is",
  "it", "its", "of", "on", "or", "she", "so", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "why", "will", "with", "you", "your",
]);

/** Segments either side of the playhead that come along as context. */
const ANCHOR_RADIUS = 1;

/** How far from the playhead a keyword match still counts as "nearby", in seconds. */
const PROXIMITY_WINDOW = 150;

/** How much a match right at the playhead outscores the same match elsewhere. */
const PROXIMITY_WEIGHT = 0.6;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * The passage being spoken at `atTime` plus its immediate neighbours. Questions
 * like "what does this mean?" carry no keywords to match on, so the moment the
 * student is looking at has to come along on its own.
 */
function anchorRange(segments: TranscriptSegment[], atTime: number) {
  const active = activeSegmentIndex(segments, atTime);
  if (active === -1) return { from: 0, to: -1 };
  return {
    from: Math.max(0, active - ANCHOR_RADIUS),
    to: Math.min(segments.length - 1, active + ANCHOR_RADIUS),
  };
}

/**
 * BM25 over the transcript segments. A lecture is a few dozen passages, so
 * scoring them all per question is cheaper and more predictable than running
 * an embedding model, and it needs nothing at request time.
 *
 * When the caller passes `atTime`, two things change: the passage at the
 * playhead is always returned, and keyword matches near it outrank equally
 * good matches from elsewhere in the lecture. A lecturer says "the dot
 * product" in six places; the one on screen is the one being asked about.
 */
export function retrieve(
  segments: TranscriptSegment[],
  question: string,
  options: RetrieveOptions = {},
): RetrievedSegment[] {
  const { limit = 5, atTime = null } = options;
  if (segments.length === 0) return [];

  const anchor = atTime === null ? { from: 0, to: -1 } : anchorRange(segments, atTime);
  const anchored = new Set<number>();
  for (let i = anchor.from; i <= anchor.to; i += 1) anchored.add(i);

  const queryTerms = tokenize(question);
  const scored: RetrievedSegment[] = [];

  if (queryTerms.length > 0) {
    const k1 = 1.5;
    const b = 0.75;

    const docs = segments.map((segment) => tokenize(segment.text));
    const averageLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length;

    const documentFrequency = new Map<string, number>();
    for (const term of new Set(queryTerms)) {
      documentFrequency.set(term, docs.filter((doc) => doc.includes(term)).length);
    }

    segments.forEach((segment, index) => {
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

      if (score <= 0) return;

      if (atTime !== null) {
        const distance = (segment.start - atTime) / PROXIMITY_WINDOW;
        score *= 1 + PROXIMITY_WEIGHT * Math.exp(-distance * distance);
      }

      scored.push({ ...segment, score, anchored: anchored.has(index) });
    });
  }

  const keyword = scored
    .sort((a, b) => b.score - a.score)
    // Anchors are added back below, so leave room for them.
    .slice(0, Math.max(0, limit - anchored.size));

  const chosen = new Map(keyword.map((segment) => [segment.id, segment]));
  for (const index of anchored) {
    const existing = chosen.get(segments[index].id);
    if (existing) {
      existing.anchored = true;
      continue;
    }
    chosen.set(segments[index].id, { ...segments[index], score: 0, anchored: true });
  }

  // Read in lecture order: the model quotes them back as a trail through the
  // recording, and a jumbled order makes it narrate them out of sequence.
  return Array.from(chosen.values()).sort((a, b) => a.start - b.start);
}
