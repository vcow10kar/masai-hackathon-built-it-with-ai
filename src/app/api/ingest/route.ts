import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getLecture } from "@/lib/lectures";
import { parseVideoSource } from "@/lib/video-source";

const run = promisify(execFile);

// Fetching captions takes seconds; the Whisper fallback takes minutes.
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const source = parseVideoSource(url);

  if (!source) {
    return NextResponse.json(
      { error: "Paste a YouTube link or a direct link to a video file." },
      { status: 400 },
    );
  }

  if (source.kind !== "youtube") {
    return NextResponse.json(
      { error: "Only YouTube links can be transcribed automatically for now." },
      { status: 400 },
    );
  }

  // Already ingested: reuse it rather than paying for the fetch again.
  const existing = await getLecture(source.videoId);
  if (existing) {
    return NextResponse.json({ lectureId: existing.id, title: existing.title, reused: true });
  }

  try {
    await run("node", [join(process.cwd(), "scripts", "ingest.mjs"), source.url], {
      timeout: 280_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    console.error("Ingest failed", error);
    const message = error instanceof Error ? error.message : "";

    if (message.includes("ENOENT") || message.includes("yt-dlp")) {
      return NextResponse.json(
        { error: "Transcription needs yt-dlp on the server. Run this locally with yt-dlp installed." },
        { status: 501 },
      );
    }

    if (message.includes("EROFS") || message.includes("read-only")) {
      return NextResponse.json(
        { error: "This deployment cannot store transcripts. Ingest locally, then commit the result." },
        { status: 501 },
      );
    }

    return NextResponse.json({ error: "Could not build a transcript for that video." }, { status: 502 });
  }

  const lecture = await getLecture(source.videoId);
  if (!lecture) {
    return NextResponse.json({ error: "Transcript was not written." }, { status: 500 });
  }

  return NextResponse.json({ lectureId: lecture.id, title: lecture.title, reused: false });
}
