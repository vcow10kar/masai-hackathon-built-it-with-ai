#!/usr/bin/env node
/**
 * Builds a timestamped transcript for one lecture and stores it under
 * data/lectures/. Prefers the video's own captions because they already carry
 * timestamps and take seconds to fetch; falls back to local Whisper when a
 * video has none.
 *
 *   node scripts/ingest.mjs <url> [--title "..."] [--whisper] [--model small.en]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mergeSegments, parseVtt } from "./vtt.mjs";

const LECTURE_DIR = join(process.cwd(), "data", "lectures");

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
}

function has(command) {
  try {
    run("which", [command]);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const [url, ...rest] = argv;
  const options = { url, title: null, forceWhisper: false, model: "small.en" };

  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--title") options.title = rest[++i];
    else if (rest[i] === "--whisper") options.forceWhisper = true;
    else if (rest[i] === "--model") options.model = rest[++i];
  }

  return options;
}

function fetchMetadata(url) {
  const raw = run("yt-dlp", ["--dump-single-json", "--skip-download", "--no-warnings", url], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const data = JSON.parse(raw);
  return {
    id: data.id,
    title: data.title ?? "Untitled lecture",
    uploader: data.uploader ?? data.channel ?? "Unknown",
    durationSeconds: Math.round(data.duration ?? 0),
  };
}

/** Returns merged segments from the video's own captions, or null if it has none. */
function captionSegments(url, workDir) {
  try {
    run("yt-dlp", [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      // Narrow list on purpose: "en.*" also pulls machine translations of other
      // languages, which are slower, rate limited, and worse than the original.
      "--sub-langs", "en,en-US,en-GB,en-orig",
      "--sub-format", "vtt",
      "--no-warnings",
      "-o", join(workDir, "%(id)s"),
      url,
    ]);
  } catch {
    // A missing or rate-limited language is not fatal as long as one of the
    // requested tracks made it to disk.
  }

  // Manually written captions sort ahead of auto-generated ones, so prefer them.
  const files = readdirSync(workDir)
    .filter((name) => name.endsWith(".vtt"))
    .sort((a, b) => Number(a.includes("auto")) - Number(b.includes("auto")));

  if (files.length === 0) return null;

  const segments = parseVtt(readFileSync(join(workDir, files[0]), "utf8"));
  return segments.length > 0 ? mergeSegments(segments) : null;
}

/** Downloads the audio and transcribes it locally with whisper.cpp. */
function whisperSegments(url, workDir, model) {
  if (!has("whisper-cli")) {
    throw new Error(
      "Whisper fallback needs whisper.cpp. Install it with:\n" +
        "  brew install whisper-cpp\n" +
        "  node scripts/fetch-whisper-model.mjs small.en",
    );
  }

  const modelPath = join(process.cwd(), "models", `ggml-${model}.bin`);
  if (!existsSync(modelPath)) {
    throw new Error(`Missing Whisper model at ${modelPath}. Run: node scripts/fetch-whisper-model.mjs ${model}`);
  }

  const audio = join(workDir, "audio.wav");
  run("yt-dlp", [
    "-x",
    "--audio-format", "wav",
    "--postprocessor-args", "-ar 16000 -ac 1",
    "--no-warnings",
    "-o", join(workDir, "audio.%(ext)s"),
    url,
  ], { stdio: "inherit" });

  run("whisper-cli", ["-m", modelPath, "-f", audio, "-ovtt", "-of", join(workDir, "whisper")], {
    stdio: "inherit",
  });

  const segments = parseVtt(readFileSync(join(workDir, "whisper.vtt"), "utf8"));
  return mergeSegments(segments);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.url) {
    console.error("Usage: node scripts/ingest.mjs <url> [--title \"...\"] [--whisper] [--model small.en]");
    process.exit(1);
  }

  if (!has("yt-dlp")) {
    console.error("yt-dlp is required. Install it with: brew install yt-dlp");
    process.exit(1);
  }

  const workDir = mkdtempSync(join(tmpdir(), "ask-the-lecture-"));

  try {
    const metadata = fetchMetadata(options.url);
    console.log(`Lecture: ${metadata.title}`);

    let segments = null;
    let source = "whisper";

    if (!options.forceWhisper) {
      segments = captionSegments(options.url, workDir);
      if (segments) source = "captions";
      else console.log("No captions published for this video, falling back to Whisper.");
    }

    if (!segments) segments = whisperSegments(options.url, workDir, options.model);

    mkdirSync(LECTURE_DIR, { recursive: true });
    const lecture = {
      ...metadata,
      title: options.title ?? metadata.title,
      url: options.url,
      source,
      ingestedAt: new Date().toISOString(),
      segments,
    };

    const outputPath = join(LECTURE_DIR, `${metadata.id}.json`);
    writeFileSync(outputPath, `${JSON.stringify(lecture, null, 2)}\n`);
    console.log(`Wrote ${segments.length} segments from ${source} to ${outputPath}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
