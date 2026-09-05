#!/usr/bin/env node
/**
 * Turns this machine into a transcription service for the deployed app.
 *
 * The deployment cannot run yt-dlp or whisper.cpp, so it can POST a media URL
 * here instead and get back timestamped segments. Expose it with a tunnel
 * (cloudflared, ngrok) and set TRANSCRIBE_URL and TRANSCRIBE_TOKEN on the
 * deployment to match.
 *
 *   TRANSCRIBE_TOKEN=some-long-random-string npm run transcribe:server
 */

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mergeSegments, parseVtt } from "../src/lib/vtt.ts";

const run = promisify(execFile);

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.TRANSCRIBE_TOKEN;
const MODEL = process.env.WHISPER_MODEL ?? "small.en";
const MODEL_PATH = join(process.cwd(), "models", `ggml-${MODEL}.bin`);

if (!TOKEN) {
  console.error("Refusing to start without TRANSCRIBE_TOKEN: this endpoint fetches URLs on request.");
  process.exit(1);
}

if (!existsSync(MODEL_PATH)) {
  console.error(`Missing model at ${MODEL_PATH}. Run: npm run whisper:model ${MODEL}`);
  process.exit(1);
}

async function transcribe(url) {
  const workDir = await mkdtemp(join(tmpdir(), "transcribe-"));

  try {
    console.log(`  downloading audio`);
    await run("yt-dlp", [
      "-x",
      "--audio-format", "wav",
      "--postprocessor-args", "-ar 16000 -ac 1",
      "--no-warnings",
      "-o", join(workDir, "audio.%(ext)s"),
      url,
    ], { timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });

    console.log(`  transcribing with ${MODEL}`);
    await run("whisper-cli", [
      "-m", MODEL_PATH,
      "-f", join(workDir, "audio.wav"),
      "-ovtt",
      "-of", join(workDir, "out"),
    ], { timeout: 3_600_000, maxBuffer: 64 * 1024 * 1024 });

    return mergeSegments(parseVtt(await readFile(join(workDir, "out.vtt"), "utf8")));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error("Body too large"));
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  const send = (status, payload) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  };

  if (request.method === "GET" && request.url === "/health") {
    return send(200, { ok: true, model: MODEL });
  }

  if (request.method !== "POST" || request.url !== "/transcribe") {
    return send(404, { error: "Not found" });
  }

  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    return send(401, { error: "Unauthorized" });
  }

  let url;
  try {
    ({ url } = JSON.parse(await readBody(request)));
  } catch {
    return send(400, { error: "Expected a JSON body" });
  }

  // This endpoint fetches whatever it is given, so only allow public web URLs.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return send(400, { error: "url must be a valid URL" });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return send(400, { error: "Only http and https URLs are accepted" });
  }

  console.log(`transcribe ${parsed.hostname}${parsed.pathname}`);
  const startedAt = Date.now();

  try {
    const segments = await transcribe(url);
    console.log(`  done: ${segments.length} segments in ${Math.round((Date.now() - startedAt) / 1000)}s`);
    send(200, { segments });
  } catch (error) {
    console.error("  failed:", error.message);
    send(502, { error: "Transcription failed" });
  }
});

server.listen(PORT, () => {
  console.log(`Transcription server on http://127.0.0.1:${PORT} using ${MODEL}`);
  console.log("Expose it with: cloudflared tunnel --url http://127.0.0.1:" + PORT);
});
