import "server-only";

import { formatTimestamp } from "./format";
import type { RetrievedSegment } from "./retrieval";
import type { FrameAttachment } from "./types";

const SYSTEM_PROMPT = `You are helping a student revise from one specific lecture.

Answer using only the numbered excerpts from that lecture's transcript. The student is asking what their lecturer said, not what is generally true about the topic.

Rules:
- Cite the excerpt each claim comes from using its id in square brackets, like [s7]. Cite at least one excerpt whenever you make a claim.
- If the excerpts do not cover the question, say the lecture does not cover it. Do not answer from your own knowledge.
- Be brief and concrete. Two or three sentences is usually enough.`;

const VISION_SYSTEM_PROMPT = `You are helping a student revise from one specific lecture. A paused frame from the recording is attached.

Answer using the image and the numbered excerpts from the lecture's transcript below. The student is asking what is shown or discussed at this moment, not what is generally true about the topic.

Rules:
- Describe only details actually visible in the image. Read on-screen text, labels, diagrams and equations carefully.
- Cite a transcript excerpt using its id in square brackets, like [s7], whenever a claim also comes from the transcript. Do not invent a citation for something only the image shows.
- If neither the image nor the excerpts answer the question, say so.
- Be brief and concrete. Two or three sentences is usually enough.`;

export type Turn = { role: "user" | "assistant"; content: string };

/** Thrown for a configuration gap the user can fix, surfaced to them as-is. */
export class VisionUnavailableError extends Error {}

function buildUserPrompt(question: string, segments: RetrievedSegment[]) {
  const excerpts = segments
    .map((segment) => `[${segment.id}] (${formatTimestamp(segment.start)}) ${segment.text}`)
    .join("\n\n");

  return `Excerpts from the lecture transcript:\n\n${excerpts}\n\nStudent's question: ${question}`;
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Unsupported image format.");
  return { mediaType: match[1], data: match[2] };
}

async function askAnthropic(
  question: string,
  segments: RetrievedSegment[],
  apiKey: string,
  history: Turn[],
  frame?: FrameAttachment,
) {
  const userContent = frame
    ? [
        { type: "image", source: { type: "base64", ...parseDataUrl(frame.dataUrl) } },
        { type: "text", text: buildUserPrompt(question, segments) },
      ]
    : buildUserPrompt(question, segments);

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
      system: frame ? VISION_SYSTEM_PROMPT : SYSTEM_PROMPT,
      messages: [
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: userContent },
      ],
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

async function askOpenRouter(
  question: string,
  segments: RetrievedSegment[],
  apiKey: string,
  history: Turn[],
  frame?: FrameAttachment,
) {
  const userContent = frame
    ? [
        { type: "text", text: buildUserPrompt(question, segments) },
        { type: "image_url", image_url: { url: frame.dataUrl } },
      ]
    : buildUserPrompt(question, segments);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "X-Title": "Ask the Lecture",
    },
    body: JSON.stringify({
      model: frame
        ? (process.env.OPENROUTER_VISION_MODEL ?? "google/gemini-2.5-flash")
        : (process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b"),
      max_tokens: 600,
      messages: [
        { role: "system", content: frame ? VISION_SYSTEM_PROMPT : SYSTEM_PROMPT },
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function askOllama(question: string, segments: RetrievedSegment[], history: Turn[]) {
  const host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? "gpt-oss:20b",
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
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
 * Picks whichever provider is configured, so the deployed site answers over a
 * hosted model while a laptop with no keys still answers from local Ollama.
 */
export async function generateAnswer(question: string, segments: RetrievedSegment[], history: Turn[] = []) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      text: await askOpenRouter(question, segments, openRouterKey, history),
      provider: "openrouter",
    } as const;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      text: await askAnthropic(question, segments, anthropicKey, history),
      provider: "anthropic",
    } as const;
  }

  return { text: await askOllama(question, segments, history), provider: "ollama" } as const;
}

/**
 * Same provider fallback as `generateAnswer`, but for a question about a
 * paused frame. Ollama has no vision model wired up here, so a laptop running
 * only local Ollama gets a clear instruction instead of a silent failure.
 */
export async function generateVisionAnswer(
  question: string,
  segments: RetrievedSegment[],
  frame: FrameAttachment,
  history: Turn[] = [],
) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      text: await askOpenRouter(question, segments, openRouterKey, history, frame),
      provider: "openrouter",
    } as const;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      text: await askAnthropic(question, segments, anthropicKey, history, frame),
      provider: "anthropic",
    } as const;
  }

  throw new VisionUnavailableError(
    "Image questions need OPENROUTER_API_KEY or ANTHROPIC_API_KEY. Local Ollama has no vision model wired up here.",
  );
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
