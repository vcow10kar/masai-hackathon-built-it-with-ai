import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import type { Lecture } from "./store";
import type { TranscriptSegment } from "./types";
import { mergeSegments, parseVtt } from "./vtt";

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

/** Fetches captions over HTTP, which is the only path that works when deployed. */
async function fetchHostedTranscript(videoId: string, apiKey: string) {
  // Without an explicit language the service returns whichever track it likes,
  // which on a multi-track video can be a translation rather than the speech.
  const response = await fetch(
    `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=false&lang=en`,
    { headers: { "x-api-key": apiKey } },
  );

  if (!response.ok) {
    throw new Error(`Transcript service failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();

  const language: string = data.lang ?? data.language ?? "";
  if (language && !language.toLowerCase().startsWith("en")) {
    throw new Error(
      `No English transcript is available for this video (got "${language}").`,
    );
  }

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

/**
 * Fetches captions with yt-dlp into a temporary directory. Nothing is written
 * inside the project: the transcript's home is the store, not the repository.
 */
async function fetchLocalTranscript(videoId: string, url: string) {
  const workDir = await mkdtemp(join(tmpdir(), "ask-the-lecture-"));

  try {
    try {
      await run("yt-dlp", [
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        // Narrow list on purpose: "en.*" also pulls machine translations of
        // other languages, which are slower, rate limited, and worse.
        "--sub-langs", "en,en-US,en-GB,en-orig",
        "--sub-format", "vtt",
        "--no-warnings",
        "-o", join(workDir, "%(id)s"),
        url,
      ], { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
    } catch {
      // A missing or rate limited language is not fatal as long as one of the
      // requested tracks reached the directory.
    }

    // Manually written captions sort ahead of auto-generated ones.
    const files = (await readdir(workDir))
      .filter((name) => name.endsWith(".vtt"))
      .sort((a, b) => Number(a.includes("auto")) - Number(b.includes("auto")));

    if (files.length === 0) return null;

    const cues = parseVtt(await readFile(join(workDir, files[0]), "utf8"));
    return cues.length > 0 ? mergeSegments(cues) : null;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Transcribes the audio locally with whisper.cpp, for videos without captions. */
async function fetchWhisperTranscript(url: string) {
  const model = process.env.WHISPER_MODEL ?? "small.en";
  const modelPath = join(process.cwd(), "models", `ggml-${model}.bin`);
  const workDir = await mkdtemp(join(tmpdir(), "ask-the-lecture-whisper-"));

  try {
    await run("yt-dlp", [
      "-x",
      "--audio-format", "wav",
      "--postprocessor-args", "-ar 16000 -ac 1",
      "--no-warnings",
      "-o", join(workDir, "audio.%(ext)s"),
      url,
    ], { timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });

    await run("whisper-cli", [
      "-m", modelPath,
      "-f", join(workDir, "audio.wav"),
      "-ovtt",
      "-of", join(workDir, "whisper"),
    ], { timeout: 1_800_000, maxBuffer: 64 * 1024 * 1024 });

    return mergeSegments(parseVtt(await readFile(join(workDir, "whisper.vtt"), "utf8")));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
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
  let source: Lecture["source"] = "captions";
  if (apiKey) {
    onProgress("Fetching the captions");
    segments = await fetchHostedTranscript(videoId, apiKey);
  } else {
    onProgress("Fetching the captions locally");
    const captions = await fetchLocalTranscript(videoId, url);

    if (captions) {
      segments = captions;
    } else {
      onProgress("No captions published, transcribing the audio");
      segments = await fetchWhisperTranscript(url);
      source = "whisper";
    }
  }

  onProgress(`Prepared ${segments.length} passages`);

  return {
    id: videoId,
    title: metadata.title,
    uploader: metadata.uploader,
    url,
    durationSeconds: Math.round(segments[segments.length - 1]?.end ?? 0),
    source,
    ingestedAt: new Date().toISOString(),
    segments,
  };
}
