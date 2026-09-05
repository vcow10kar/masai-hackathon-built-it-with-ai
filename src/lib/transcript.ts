import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { Lecture } from "./store";
import type { TranscriptSegment } from "./types";

const run = promisify(execFile);

export type IngestProgress = (message: string) => void;

/**
 * Title and channel without an API key. Duration is not exposed here, so it is
 * derived from the transcript instead.
 */
async function fetchMetadata(url: string) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (!response.ok) return { title: "Untitled lecture", uploader: "Unknown" };
    const data = await response.json();
    return {
      title: typeof data.title === "string" ? data.title : "Untitled lecture",
      uploader: typeof data.author_name === "string" ? data.author_name : "Unknown",
    };
  } catch {
    return { title: "Untitled lecture", uploader: "Unknown" };
  }
}

/**
 * Caption cues are a few words long, which is too small to retrieve over.
 * Merges them into passages big enough to answer from, keeping the start time
 * of the first cue since that is what the player seeks to.
 */
function mergeSegments(
  segments: Array<{ start: number; end: number; text: string }>,
  { maxSeconds = 45, maxChars = 700 } = {},
): TranscriptSegment[] {
  const merged: Array<{ start: number; end: number; text: string }> = [];

  for (const segment of segments) {
    const current = merged[merged.length - 1];
    const wouldRun = current ? segment.end - current.start : 0;
    const wouldLength = current ? current.text.length + segment.text.length + 1 : 0;

    if (current && wouldRun <= maxSeconds && wouldLength <= maxChars) {
      current.end = segment.end;
      current.text = `${current.text} ${segment.text}`.trim();
    } else {
      merged.push({ ...segment });
    }
  }

  return merged.map((segment, index) => ({ id: `s${index + 1}`, ...segment }));
}

/** Fetches captions over HTTP, which is the only path that works when deployed. */
async function fetchHostedTranscript(videoId: string, apiKey: string) {
  const response = await fetch(
    `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=false`,
    { headers: { "x-api-key": apiKey } },
  );

  if (!response.ok) {
    throw new Error(`Transcript service failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const content: Array<{ text?: string; offset?: number; duration?: number }> =
    data.content ?? data.transcript ?? [];

  const cues = content
    .filter((cue) => typeof cue.text === "string" && cue.text.trim().length > 0)
    .map((cue) => {
      // Offsets and durations arrive in milliseconds.
      const start = (cue.offset ?? 0) / 1000;
      return { start, end: start + (cue.duration ?? 0) / 1000, text: cue.text!.trim() };
    });

  if (cues.length === 0) throw new Error("The transcript service returned no captions.");
  return mergeSegments(cues);
}

/** Runs the local ingest script, which needs yt-dlp on the machine. */
async function fetchLocalTranscript(videoId: string, url: string) {
  await run("node", [join(process.cwd(), "scripts", "ingest.mjs"), url], {
    timeout: 280_000,
    maxBuffer: 64 * 1024 * 1024,
  });

  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(join(process.cwd(), "data", "lectures", `${videoId}.json`), "utf8");
  return (JSON.parse(raw) as Lecture).segments;
}

/**
 * Builds a transcript for one video. Prefers the hosted service so the
 * deployed app works, and falls back to the local toolchain in development.
 */
export async function buildLecture(
  videoId: string,
  url: string,
  onProgress: IngestProgress = () => {},
): Promise<Lecture> {
  const apiKey = process.env.SUPADATA_API_KEY;

  onProgress("Reading the video details");
  const metadata = await fetchMetadata(url);

  let segments: TranscriptSegment[];
  if (apiKey) {
    onProgress("Fetching the captions");
    segments = await fetchHostedTranscript(videoId, apiKey);
  } else {
    onProgress("Fetching the captions locally");
    segments = await fetchLocalTranscript(videoId, url);
  }

  onProgress(`Prepared ${segments.length} passages`);

  return {
    id: videoId,
    title: metadata.title,
    uploader: metadata.uploader,
    url,
    durationSeconds: Math.round(segments[segments.length - 1]?.end ?? 0),
    source: "captions",
    ingestedAt: new Date().toISOString(),
    segments,
  };
}
