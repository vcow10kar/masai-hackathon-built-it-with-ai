import { NextResponse } from "next/server";
import { extractCitations, generateAnswer } from "@/lib/answer";
import { getLecture } from "@/lib/store";
import { retrieve } from "@/lib/retrieval";

// The local model can take a while to answer on a cold load.
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { lectureId?: unknown; question?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const lectureId = typeof body.lectureId === "string" ? body.lectureId : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";

  if (!lectureId || !question) {
    return NextResponse.json({ error: "lectureId and question are required." }, { status: 400 });
  }

  const lecture = await getLecture(lectureId);
  if (!lecture) {
    return NextResponse.json({ error: "That lecture has not been ingested." }, { status: 404 });
  }

  const retrieved = retrieve(lecture.segments, question);
  if (retrieved.length === 0) {
    return NextResponse.json({
      answer: "I could not find anything about that in this lecture.",
      citations: [],
    });
  }

  try {
    const { text, provider } = await generateAnswer(question, retrieved);
    return NextResponse.json({
      answer: text,
      citations: extractCitations(text, retrieved),
      provider,
    });
  } catch (error) {
    console.error("Answer generation failed", error);
    return NextResponse.json(
      { error: "Could not generate an answer. Check that the model provider is reachable." },
      { status: 502 },
    );
  }
}
