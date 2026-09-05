import { NextResponse } from "next/server";
import {
  extractCitations,
  generateAnswer,
  generateVisionAnswer,
  stripUnknownCitations,
  VisionUnavailableError,
} from "@/lib/answer";
import { getLecture } from "@/lib/store";
import { retrieve } from "@/lib/retrieval";
import type { FrameAttachment } from "@/lib/types";

// The local model can take a while to answer on a cold load.
export const maxDuration = 60;

const MAX_FRAME_DATA_URL_LENGTH = 4_000_000;
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/** Turns the last few exchanges into context without resending the whole thread. */
const HISTORY_LIMIT = 6;

type Turn = { role: "user" | "assistant"; content: string };

function historyTurns(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (turn): turn is Turn =>
        typeof turn?.content === "string" && (turn.role === "user" || turn.role === "assistant"),
    )
    .slice(-HISTORY_LIMIT);
}

function frameAttachment(value: unknown): FrameAttachment | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FrameAttachment>;
  if (
    typeof candidate.dataUrl !== "string" ||
    candidate.dataUrl.length > MAX_FRAME_DATA_URL_LENGTH ||
    !IMAGE_DATA_URL.test(candidate.dataUrl) ||
    typeof candidate.timestamp !== "number" ||
    !Number.isFinite(candidate.timestamp) ||
    candidate.timestamp < 0
  ) {
    return null;
  }
  return { dataUrl: candidate.dataUrl, timestamp: candidate.timestamp };
}

export async function POST(request: Request) {
  let body: {
    lectureId?: unknown;
    question?: unknown;
    history?: unknown;
    frame?: unknown;
    atTime?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const lectureId = typeof body.lectureId === "string" ? body.lectureId : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const history = historyTurns(body.history);
  // Where the player is paused. Optional: a question asked before playback
  // starts is still a fair question about the lecture as a whole.
  const atTime =
    typeof body.atTime === "number" && Number.isFinite(body.atTime) && body.atTime >= 0
      ? body.atTime
      : null;

  if (!lectureId || !question) {
    return NextResponse.json({ error: "lectureId and question are required." }, { status: 400 });
  }

  if (body.frame !== undefined && frameAttachment(body.frame) === null) {
    return NextResponse.json({ error: "The captured frame is invalid or too large." }, { status: 400 });
  }
  const frame = frameAttachment(body.frame);

  const lecture = await getLecture(lectureId);
  if (!lecture) {
    return NextResponse.json({ error: "That lecture has not been ingested." }, { status: 404 });
  }

  const retrieved = retrieve(lecture.segments, question, {
    atTime: frame ? frame.timestamp : atTime,
  });
  // With the transcript in the prompt the model can still answer when keyword
  // search matches nothing, so only bail when there is no lecture to read.
  if (!frame && retrieved.length === 0 && lecture.segments.length === 0) {
    return NextResponse.json({
      answer: "I could not find anything about that in this lecture.",
      citations: [],
    });
  }

  try {
    const { text, provider } = frame
      ? await generateVisionAnswer(question, retrieved, frame, history, lecture.segments)
      : await generateAnswer(question, retrieved, history, atTime, lecture.segments);

    // The model reads the whole transcript, so it can cite a passage keyword
    // search did not rank. Resolve against the lecture, not the excerpts.
    const citations = extractCitations(text, lecture.segments);

    // Asked about the moment on screen, models often answer without citing
    // anything, which leaves nothing to click. The passage at the playhead is
    // where that answer came from, so offer it as the way back.
    if (citations.length === 0) {
      const anchor = retrieved.find((segment) => segment.anchored);
      if (anchor) {
        citations.push({ kind: "transcript", segmentId: anchor.id, start: anchor.start });
      }
    }

    return NextResponse.json({
      answer: stripUnknownCitations(text, lecture.segments),
      citations,
      provider,
    });
  } catch (error) {
    console.error("Answer generation failed", error);
    const message =
      error instanceof VisionUnavailableError
        ? error.message
        : "Could not generate an answer. Check that the model provider is reachable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
