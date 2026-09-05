import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import type { Lecture } from "./store";
import { lectureIdFor, type VideoSource } from "./video-source";
import type { TranscriptSegment } from "./types";
import { mergeSegments, parseVtt } from "./vtt";

const run = promisify(execFile);

export type IngestProgress = (message: string) => void;

/**
 * Title and channel without an API key. Duration is not exposed here, so it is
 * derived from the transcript instead.
 */
function metadataFromUrl(url: string) {
  try {
    const { hostname, pathname } = new URL(url);
    const fileName = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "");
    const title = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
    return { title: title || "Lecture recording", uploader: hostname };
  } catch {
    return { title: "Lecture recording", uploader: "Unknown" };
  }
}

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
 * Sends the URL to a transcription server the operator runs themselves, which
 * is how a deployment can use whisper.cpp on a machine it does not control.
 */
async function fetchBridgedSpeechToText(url: string, endpoint: string) {
  const token = process.env.TRANSCRIBE_TOKEN;

  // Accept either the tunnel root or the full endpoint, since both are natural
  // things to paste.
  const target = endpoint.replace(/\/+$/, "");
  const address = target.endsWith("/transcribe") ? target : `${target}/transcribe`;

  const response = await fetch(address, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url }),
    // Transcribing a lecture takes minutes, well past a default fetch timeout.
    signal: AbortSignal.timeout(Number(process.env.TRANSCRIBE_TIMEOUT_MS ?? 840_000)),
  });

  if (!response.ok) {
    throw new Error(`Transcription server failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const segments: TranscriptSegment[] = data.segments ?? [];
  if (segments.length === 0) throw new Error("The transcription server returned no speech.");
  return segments;
}

/**
 * Transcribes a media URL with Deepgram. The service fetches the file itself,
 * which is what makes this viable when deployed: a lecture recording is far
 * too large to pull through a serverless function.
 */
async function fetchHostedSpeechToText(url: string, apiKey: string) {
  const response = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&utterances=true",
    {
      method: "POST",
      headers: { authorization: `Token ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ url }),
    },
  );

  if (!response.ok) {
    throw new Error(`Transcription failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  const utterances: Array<{ start?: number; end?: number; transcript?: string }> =
    data.results?.utterances ?? [];

  const cues = utterances
    .filter((utterance) => (utterance.transcript ?? "").trim().length > 0)
    .map((utterance) => ({
      start: utterance.start ?? 0,
      end: utterance.end ?? 0,
      text: utterance.transcript!.trim(),
    }));

  if (cues.length === 0) throw new Error("The transcription returned no speech.");
  return mergeSegments(cues);
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
async function fetchLocalTranscript(url: string) {
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

  // Fail with the fix rather than an opaque error from the binary.
  if (!existsSync(modelPath)) {
    throw new Error(
      `This video has no captions, so it needs speech to text. Set DEEPGRAM_API_KEY, or download the local model with: npm run whisper:model ${model}`,
    );
  }

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
 * Builds a transcript for one recording. Each step prefers the hosted service
 * so the deployed app works, and falls back to the local toolchain otherwise.
 */
export async function buildLecture(
  source: VideoSource,
  onProgress: IngestProgress = () => {},
): Promise<Lecture> {
  const id = lectureIdFor(source);

  onProgress("Reading the video details");
  const metadata =
    source.kind === "youtube" ? await fetchMetadata(source.url) : metadataFromUrl(source.url);

  let segments: TranscriptSegment[];
  let kind: Lecture["source"] = "captions";

  if (source.kind === "youtube") {
    const captionsKey = process.env.SUPADATA_API_KEY;

    if (captionsKey) {
      onProgress("Fetching the captions");
      segments = await fetchHostedTranscript(source.videoId, captionsKey);
    } else {
      onProgress("Fetching the captions locally");
      const captions = await fetchLocalTranscript(source.url);

      if (captions) {
        segments = captions;
      } else {
        onProgress("No captions published, transcribing the audio");
        segments = await fetchWhisperTranscript(source.url);
        kind = "whisper";
      }
    }
  } else {
    // A direct media link has no captions to read, so it always needs speech
    // to text.
    kind = "whisper";
    const bridge = process.env.TRANSCRIBE_URL;
    const speechKey = process.env.DEEPGRAM_API_KEY;

    if (bridge) {
      onProgress("Transcribing the audio, this takes a few minutes");
      segments = await fetchBridgedSpeechToText(source.url, bridge);
    } else if (speechKey) {
      onProgress("Transcribing the audio");
      segments = await fetchHostedSpeechToText(source.url, speechKey);
    } else {
      onProgress("Transcribing the audio locally, this takes a few minutes");
      segments = await fetchWhisperTranscript(source.url);
    }
  }

  onProgress(`Prepared ${segments.length} passages`);

  return {
    id,
    title: metadata.title,
    uploader: metadata.uploader,
    url: source.url,
    durationSeconds: Math.round(segments[segments.length - 1]?.end ?? 0),
    source: kind,
    ingestedAt: new Date().toISOString(),
    segments,
  };
}
