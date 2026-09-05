import "server-only";

import { formatTimestamp } from "./format";
import type { RetrievedSegment } from "./retrieval";
import type { FrameAttachment } from "./types";

const SYSTEM_PROMPT = `You are helping a student revise from one specific lecture.

Answer using only the numbered excerpts from that lecture's transcript. The student is asking what their lecturer said, not what is generally true about the topic.

Rules:
- Cite the excerpt each claim comes from using its id in square brackets, like [s7]. Use the id of the excerpt the claim was actually read from and no other, and only ids listed below. Cite at least one excerpt whenever you make a claim.
- If the excerpts do not cover the question, say the lecture does not cover it. Do not answer from your own knowledge.
- When the student is paused somewhere, "this", "here", "that bit" and "what he just said" all mean the excerpt marked NOW PLAYING. Answer about that passage unless they clearly ask about something else.
- Be brief and concrete. Two or three sentences is usually enough.`;

const VISION_SYSTEM_PROMPT = `You are helping a student revise from one specific lecture. A paused frame from the recording is attached.

Answer using the image and the numbered excerpts from the lecture's transcript below. The student is asking what is shown or discussed at this moment, not what is generally true about the topic.

Rules:
- Describe only details actually visible in the image. Read on-screen text, labels, diagrams and equations carefully.
- Cite a transcript excerpt using its id in square brackets, like [s7], whenever a claim also comes from the transcript. Use the id of the excerpt the claim was actually read from and no other, and only ids listed below. Do not invent a citation for something only the image shows.
- When the student is paused somewhere, "this", "here" and "what he just said" mean the attached frame and the excerpt marked NOW PLAYING. Answer about that moment unless they clearly ask about something else.
- If neither the image nor the excerpts answer the question, say so.
- Be brief and concrete. Two or three sentences is usually enough.`;

const OPENROUTER_MODEL = "openai/gpt-5.6-luna";

export type Turn = { role: "user" | "assistant"; content: string };

/** Thrown for a configuration gap the user can fix, surfaced to them as-is. */
export class VisionUnavailableError extends Error {}

function buildUserPrompt(question: string, segments: RetrievedSegment[], atTime?: number | null) {
  const excerpts = segments
    .map((segment) => {
      const marker = segment.anchored ? " NOW PLAYING" : "";
      return `[${segment.id}] (${formatTimestamp(segment.start)})${marker} ${segment.text}`;
    })
    .join("\n\n");

  const position =
    typeof atTime === "number"
      ? `The student has the recording paused at ${formatTimestamp(atTime)}.\n\n`
      : "";

  return `${position}Excerpts from the lecture transcript:\n\n${excerpts}\n\nStudent's question: ${question}`;
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Unsupported image format.");
  return { mediaType: match[1], data: match[2] };
}

async function askAnthropic(prompt: string, apiKey: string, history: Turn[], frame?: FrameAttachment) {
  const userContent = frame
    ? [
        { type: "image", source: { type: "base64", ...parseDataUrl(frame.dataUrl) } },
        { type: "text", text: prompt },
      ]
    : prompt;

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

async function askOpenRouter(prompt: string, apiKey: string, history: Turn[], frame?: FrameAttachment) {
  const userContent = frame
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: frame.dataUrl } },
      ]
    : prompt;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "X-Title": "Ask the Lecture",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 2048,
      reasoning: { effort: "medium" },
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
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!text) {
    throw new Error(
      `OpenRouter returned an empty answer (finish reason: ${data.choices?.[0]?.finish_reason ?? "unknown"}).`,
    );
  }
  return text;
}

/**
 * Sends the prompt to a machine the operator runs, which is how a deployment
 * can answer with a local model it cannot host itself.
 */
async function askBridge(prompt: string, history: Turn[], endpoint: string) {
  const token = process.env.TRANSCRIBE_TOKEN;

  // Accept either the tunnel root or the full endpoint.
  const target = endpoint.replace(/\/+$/, "");
  const address = target.endsWith("/answer") ? target : `${target}/answer`;

  const conversation = history
    .map((turn) => `${turn.role === "user" ? "Student" : "You"}: ${turn.content}`)
    .join("\n\n");

  const response = await fetch(address, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      system: SYSTEM_PROMPT,
      prompt: conversation ? `${conversation}\n\n${prompt}` : prompt,
    }),
    // A local model is slower than a hosted one.
    signal: AbortSignal.timeout(Number(process.env.ANSWER_TIMEOUT_MS ?? 300_000)),
  });

  if (!response.ok) {
    throw new Error(`Answer server failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return (data.text ?? "").trim();
}

async function askOllama(prompt: string, history: Turn[]) {
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
        { role: "user", content: prompt },
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
 * Picks whichever provider is configured: a server the operator runs, then a
 * hosted model, and finally a local Ollama on this machine.
 *
 * `atTime` is where the student has the recording paused, and it goes into the
 * prompt so that "explain this" resolves to the passage on screen.
 */
export async function generateAnswer(
  question: string,
  segments: RetrievedSegment[],
  history: Turn[] = [],
  atTime: number | null = null,
) {
  const prompt = buildUserPrompt(question, segments, atTime);

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return { text: await askOpenRouter(prompt, openRouterKey, history), provider: "openrouter" } as const;
  }

  const bridge = process.env.ANSWER_URL;
  if (bridge) {
    return { text: await askBridge(prompt, history, bridge), provider: "bridged" } as const;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return { text: await askAnthropic(prompt, anthropicKey, history), provider: "anthropic" } as const;
  }

  return { text: await askOllama(prompt, history), provider: "ollama" } as const;
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
  // The frame's own timestamp is the exact moment being asked about.
  const prompt = buildUserPrompt(question, segments, frame.timestamp);

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return {
      text: await askOpenRouter(prompt, openRouterKey, history, frame),
      provider: "openrouter",
    } as const;
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return {
      text: await askAnthropic(prompt, anthropicKey, history, frame),
      provider: "anthropic",
    } as const;
  }

  throw new VisionUnavailableError(
    "Image questions need OPENROUTER_API_KEY or ANTHROPIC_API_KEY. Local Ollama has no vision model wired up here.",
  );
}

/** Matches a citation marker, tolerating the spacing some models emit. */
const CITATION_MARKER = /\[\s*(s\d+)\s*\]/g;

/**
 * Removes citation markers pointing at excerpts that were never retrieved.
 * A model that invents [s0] would otherwise leave dead text in the answer with
 * no chip beside it to explain what it meant.
 */
export function stripUnknownCitations(text: string, segments: RetrievedSegment[]) {
  const known = new Set(segments.map((segment) => segment.id));
  return text
    .replace(CITATION_MARKER, (marker, id: string) => (known.has(id) ? marker : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:])/g, "$1")
    .trim();
}

/** Pulls the [s3] markers out of the answer and resolves them to segments. */
export function extractCitations(text: string, segments: RetrievedSegment[]) {
  const cited = new Set(Array.from(text.matchAll(CITATION_MARKER), (match) => match[1]));

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
