import "server-only";

import { formatTimestamp } from "./format";
import type { RetrievedSegment } from "./retrieval";
import type { FrameAttachment, TranscriptSegment } from "./types";

const ANSWER_STYLE = `How to answer:
- Write in simple, plain English, for someone meeting the idea for the first time. Short sentences, everyday words.
- Say what the lecturer said, then put it in ordinary words. Explain a term the moment it is used.
- Use the lecturer's own examples, numbers and wording. Do not swap in examples of your own.
- Make no assumptions. If the transcript does not say something, do not fill the gap and do not guess what the lecturer meant. Say which part the lecture does not cover.
- Add nothing from outside the transcript: no extra background, definitions, formulas or corrections.
- The transcript is machine-generated and can mishear words. If a word looks garbled, say it is unclear rather than deciding what it should have been.
- Be as long as the explanation needs and no longer. Usually a short paragraph; use a few short bullets for a sequence of steps.`;

const SYSTEM_PROMPT = `You are helping a student understand one specific lecture.

Answer only from that lecture's transcript, given below as JSON plus a set of numbered excerpts. The student is asking what their lecturer actually said, not what is generally true about the topic.

${ANSWER_STYLE}

Citing:
- Cite the passage each claim comes from using its id in square brackets, like [s7]. Use the id of the passage the claim was actually read from and no other, and only ids that appear in the transcript below.
- Every sentence that reports something from the lecture ends with a citation, including a sentence that restates an earlier point in easier words. If you cannot point to the passage a sentence came from, do not write that sentence.
- If the transcript does not cover the question, say the lecture does not cover it. Do not answer from your own knowledge.
- When the student is paused somewhere, "this", "here", "that bit" and "what he just said" all mean the passage marked NOW PLAYING. Explain that passage unless they clearly ask about something else.`;

const VISION_SYSTEM_PROMPT = `You are helping a student understand one specific lecture. A paused frame from the recording is attached.

Answer using the image and the lecture transcript below. The student is asking what is shown or discussed at this moment, not what is generally true about the topic.

${ANSWER_STYLE}
- Describe only details actually visible in the image. Read on-screen text, labels, diagrams and equations carefully, and say when something is too small or blurred to read.

Citing:
- Cite a transcript passage using its id in square brackets, like [s7], whenever a claim also comes from the transcript. Use the id of the passage the claim was actually read from and no other. Do not invent a citation for something only the image shows.
- When the student is paused somewhere, "this", "here" and "what he just said" mean the attached frame and the passage marked NOW PLAYING. Explain that moment unless they clearly ask about something else.
- If neither the image nor the transcript answers the question, say so.`;

export type Turn = { role: "user" | "assistant"; content: string };

/** Thrown for a configuration gap the user can fix, surfaced to them as-is. */
export class VisionUnavailableError extends Error {}

/**
 * How much of the transcript JSON is allowed into the prompt, in characters.
 * A 50-minute lecture is roughly 40k characters, which fits gpt-oss:20b's
 * context alongside the answer; longer recordings get a window around the
 * playhead instead of a silent truncation.
 */
const TRANSCRIPT_BUDGET = Number(process.env.ANSWER_TRANSCRIPT_BUDGET ?? 40_000);

type PromptOptions = {
  /** Where the student has the recording paused, in seconds. */
  atTime?: number | null;
  /** The whole lecture, so the model can read around the excerpts. */
  transcript?: TranscriptSegment[];
};

function segmentJson(segment: TranscriptSegment) {
  return JSON.stringify({
    id: segment.id,
    start: Number(segment.start.toFixed(2)),
    end: Number(segment.end.toFixed(2)),
    text: segment.text,
  });
}

/**
 * The transcript as JSON, centred on wherever the student is paused so that a
 * lecture too long for the context window keeps the part being asked about.
 * Returns the trimmed lines plus what was dropped, because the model has to be
 * told what it cannot see rather than left to assume the lecture ends there.
 */
function transcriptWindow(transcript: TranscriptSegment[], atTime?: number | null) {
  const lines = transcript.map(segmentJson);
  const total = lines.reduce((sum, line) => sum + line.length + 1, 0);
  if (total <= TRANSCRIPT_BUDGET) return { from: 0, to: transcript.length - 1, lines };

  const centre =
    typeof atTime === "number"
      ? Math.max(0, transcript.findIndex((segment) => segment.end >= atTime))
      : 0;

  let from = centre;
  let to = centre;
  let used = lines[centre].length + 1;
  // Grow outwards a passage at a time, alternating sides, so the window stays
  // centred on the playhead rather than sliding towards whichever side has the
  // shorter lines.
  let forward = true;
  while (from > 0 || to < transcript.length - 1) {
    const canGoForward = to < transcript.length - 1;
    const canGoBack = from > 0;
    const goForward = forward ? canGoForward : !canGoBack;

    const index = goForward ? to + 1 : from - 1;
    const cost = lines[index].length + 1;
    if (used + cost > TRANSCRIPT_BUDGET) break;

    used += cost;
    if (goForward) to += 1;
    else from -= 1;
    forward = !forward;
  }

  return { from, to, lines: lines.slice(from, to + 1) };
}

function buildUserPrompt(question: string, segments: RetrievedSegment[], options: PromptOptions = {}) {
  const { atTime = null, transcript = [] } = options;

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

  // The whole transcript comes along as JSON so the model can follow a point
  // the lecturer builds over several passages, instead of guessing at what
  // sits either side of the excerpts keyword search happened to pick.
  let transcriptBlock = "";
  if (transcript.length > 0) {
    const window = transcriptWindow(transcript, atTime);
    const missingBefore = window.from > 0 ? window.from : 0;
    const missingAfter =
      window.to < transcript.length - 1 ? transcript.length - 1 - window.to : 0;

    const notes = [
      `This is the lecture transcript, one JSON object per spoken passage, in order. \`start\` and \`end\` are seconds into the recording.`,
      missingBefore > 0 || missingAfter > 0
        ? `This is part of the transcript, not all of it: ${missingBefore} passage(s) before and ${missingAfter} after are not shown. Do not assume anything about what they say.`
        : `This is the complete transcript. Anything not in it was not said in this lecture.`,
    ].join(" ");

    transcriptBlock = `${notes}\n\n<transcript>\n${window.lines.join("\n")}\n</transcript>\n\n`;
  }

  const excerptBlock = excerpts
    ? `The passages most likely to answer the question, pulled out of that transcript:\n\n${excerpts}\n\n`
    : "";

  return `${position}${transcriptBlock}${excerptBlock}Student's question: ${question}`;
}

/** Room for an explanation rather than a one-line lookup. */
const ANSWER_TOKENS = Number(process.env.ANSWER_MAX_TOKENS ?? 900);

/**
 * gpt-oss answers in channels: a private `analysis` pass, then the reply on a
 * `final` channel. A server that hands back the raw completion leaks the
 * reasoning into the answer, so keep only what follows the final marker.
 */
function stripReasoning(text: string) {
  const final = text.lastIndexOf("assistantfinal");
  const trimmed = final === -1 ? text : text.slice(final + "assistantfinal".length);
  return trimmed
    .replace(/<\|(?:start|end|channel|message|return)\|>/g, "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim();
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
      max_tokens: ANSWER_TOKENS,
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
      // gpt-oss is text-only, so a frame question needs a vision model even
      // when the text answers come from gpt-oss.
      model: frame
        ? (process.env.OPENROUTER_VISION_MODEL ?? "qwen/qwen3.5-9b")
        : (process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b"),
      max_tokens: ANSWER_TOKENS,
      // gpt-oss and Qwen3.5 both reason before answering. Left unbounded they
      // spend the whole budget thinking and return empty content; the whole
      // transcript is already in front of them, so keep the pass short.
      reasoning: { effort: process.env.ANSWER_REASONING_EFFORT ?? "medium" },
      temperature: Number(process.env.ANSWER_TEMPERATURE ?? 0.2),
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
  const text = stripReasoning((data.choices?.[0]?.message?.content ?? "").trim());
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
      max_tokens: ANSWER_TOKENS,
      // The transcript is in front of the model; invention is the failure to
      // guard against, not dullness.
      temperature: Number(process.env.ANSWER_TEMPERATURE ?? 0.2),
    }),
    // A local model is slower than a hosted one.
    signal: AbortSignal.timeout(Number(process.env.ANSWER_TIMEOUT_MS ?? 300_000)),
  });

  if (!response.ok) {
    throw new Error(`Answer server failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const text = stripReasoning((data.text ?? "").trim());
  if (!text) {
    throw new Error("The answer server returned an empty answer.");
  }
  return text;
}

async function askOllama(prompt: string, history: Turn[]) {
  const host = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

  const response = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL ?? "gpt-oss:20b",
      stream: false,
      // gpt-oss reasons before answering. Keep it short: the transcript is
      // already in the prompt, and a long private pass eats the context the
      // transcript needs.
      think: process.env.OLLAMA_THINK ?? "low",
      options: {
        // The whole transcript now travels in the prompt, so the default 4k
        // window would silently drop the beginning of it.
        num_ctx: Number(process.env.OLLAMA_NUM_CTX ?? 16_384),
        num_predict: ANSWER_TOKENS,
        temperature: Number(process.env.ANSWER_TEMPERATURE ?? 0.2),
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(Number(process.env.ANSWER_TIMEOUT_MS ?? 300_000)),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const text = stripReasoning((data.message?.content ?? "").trim());
  if (!text) {
    throw new Error(
      "Ollama returned an empty answer. gpt-oss spends its whole budget reasoning when the context window is too small for the transcript: raise OLLAMA_NUM_CTX or lower ANSWER_TRANSCRIPT_BUDGET.",
    );
  }
  return text;
}

/**
 * Picks whichever provider is configured: a server the operator runs, then a
 * hosted model, and finally a local Ollama on this machine.
 *
 * `atTime` is where the student has the recording paused, and it goes into the
 * prompt so that "explain this" resolves to the passage on screen. `transcript`
 * is the whole lecture: the retrieved excerpts say where to look, the
 * transcript lets the model read around them rather than infer the gaps.
 */
export async function generateAnswer(
  question: string,
  segments: RetrievedSegment[],
  history: Turn[] = [],
  atTime: number | null = null,
  transcript: TranscriptSegment[] = [],
) {
  const prompt = buildUserPrompt(question, segments, { atTime, transcript });

  const bridge = process.env.ANSWER_URL;
  if (bridge) {
    return { text: await askBridge(prompt, history, bridge), provider: "bridged" } as const;
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    return { text: await askOpenRouter(prompt, openRouterKey, history), provider: "openrouter" } as const;
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
  transcript: TranscriptSegment[] = [],
) {
  // The frame's own timestamp is the exact moment being asked about.
  const prompt = buildUserPrompt(question, segments, { atTime: frame.timestamp, transcript });

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

/** Anything with an id and a place in the recording can be cited. */
type Citable = Pick<TranscriptSegment, "id" | "start">;

/**
 * Matches a citation marker, tolerating the spacing some models emit and the
 * fullwidth brackets gpt-oss reaches for when it has been reasoning in another
 * script: 【s7】 has to resolve to the same chip as [s7].
 */
const CITATION_MARKER = /[[\u3010\uFF3B]\s*(s\d+)\s*[\]\u3011\uFF3D]/g;

/**
 * Removes citation markers pointing at passages that are not in this lecture.
 * A model that invents [s0] would otherwise leave dead text in the answer with
 * no chip beside it to explain what it meant.
 */
export function stripUnknownCitations(text: string, segments: Citable[]) {
  const known = new Set(segments.map((segment) => segment.id));
  return text
    .replace(CITATION_MARKER, (marker, id: string) => (known.has(id) ? `[${id}]` : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:])/g, "$1")
    .trim();
}

/** Pulls the [s3] markers out of the answer and resolves them to segments. */
export function extractCitations(text: string, segments: Citable[]) {
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
