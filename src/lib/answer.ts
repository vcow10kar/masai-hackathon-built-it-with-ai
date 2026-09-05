import "server-only";

import { formatTimestamp } from "./format";
import type { RetrievedSegment } from "./retrieval";

const SYSTEM_PROMPT = `You are helping a student revise from one specific lecture.

Answer using only the numbered excerpts from that lecture's transcript. The student is asking what their lecturer said, not what is generally true about the topic.

Rules:
- Cite the excerpt each claim comes from using its id in square brackets, like [s7]. Cite at least one excerpt whenever you make a claim.
- If the excerpts do not cover the question, say the lecture does not cover it. Do not answer from your own knowledge.
- Be brief and concrete. Two or three sentences is usually enough.`;

function buildUserPrompt(question: string, segments: RetrievedSegment[]) {
  const excerpts = segments
    .map((segment) => `[${segment.id}] (${formatTimestamp(segment.start)}) ${segment.text}`)
    .join("\n\n");

  return `Excerpts from the lecture transcript:\n\n${excerpts}\n\nStudent's question: ${question}`;
}

async function askAnthropic(question: string, segments: RetrievedSegment[], apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(question, segments) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return (data.content ?? [])
    .filter((block: { type: string }) => block.type === "text")
    .map((block: { text: string }) => block.text)
    .join("")
    .trim();
}

async function askOllama(question: string, segments: RetrievedSegment[]) {
  const host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? "gpt-oss:20b",
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(question, segments) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return (data.message?.content ?? "").trim();
}

/**
 * Uses Anthropic when a key is configured so the deployed site works, and the
 * local Ollama model otherwise so the laptop build keeps working offline.
 */
export async function generateAnswer(question: string, segments: RetrievedSegment[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const text = apiKey
    ? await askAnthropic(question, segments, apiKey)
    : await askOllama(question, segments);

  return { text, provider: apiKey ? "anthropic" : "ollama" } as const;
}

/** Pulls the [s3] markers out of the answer and resolves them to segments. */
export function extractCitations(text: string, segments: RetrievedSegment[]) {
  const cited = new Set(Array.from(text.matchAll(/\[(s\d+)\]/g), (match) => match[1]));

  return segments
    .filter((segment) => cited.has(segment.id))
    // Chips read as a trail through the lecture, so order them by time rather
    // than by retrieval score.
    .sort((a, b) => a.start - b.start)
    .map((segment) => ({
      kind: "transcript" as const,
      segmentId: segment.id,
      start: segment.start,
    }));
}
