import { NextResponse } from "next/server";
import { extractCitations, generateAnswer, generateVisionAnswer, VisionUnavailableError } from "@/lib/answer";
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
  let body: { lectureId?: unknown; question?: unknown; history?: unknown; frame?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const lectureId = typeof body.lectureId === "string" ? body.lectureId : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const history = historyTurns(body.history);

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

  const retrieved = retrieve(lecture.segments, question);
  if (!frame && retrieved.length === 0) {
    return NextResponse.json({
      answer: "I could not find anything about that in this lecture.",
      citations: [],
    });
  }

  try {
    const { text, provider } = frame
      ? await generateVisionAnswer(question, retrieved, frame, history)
      : await generateAnswer(question, retrieved, history);

    return NextResponse.json({
      answer: text,
      citations: extractCitations(text, retrieved),
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
