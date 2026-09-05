#!/usr/bin/env node
/**
 * Turns this machine into a transcription service for the deployed app.
 *
 * The deployment cannot run yt-dlp, whisper.cpp or a local language model, so
 * it can POST here instead: /transcribe returns timestamped segments for a
 * media URL, and /answer runs a prompt through the local model. Expose it with a tunnel
 * (cloudflared, ngrok) and set TRANSCRIBE_URL and TRANSCRIBE_TOKEN on the
 * deployment to match.
 *
 *   TRANSCRIBE_TOKEN=some-long-random-string npm run transcribe:server
 */

import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { mergeSegments, parseVtt } from "../src/lib/vtt.ts";

const run = promisify(execFile);

const started = Date.now();
const since = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;

function log(...parts) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);
}

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.TRANSCRIBE_TOKEN;
const MODEL = process.env.WHISPER_MODEL ?? "small.en";
const ANSWER_MODEL = process.env.ANSWER_MODEL ?? "gpt-oss:20b";
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const MODEL_PATH = join(process.cwd(), "models", `ggml-${MODEL}.bin`);

if (!TOKEN) {
  console.error("Refusing to start without TRANSCRIBE_TOKEN: this endpoint fetches URLs on request.");
  process.exit(1);
}

if (!existsSync(MODEL_PATH)) {
  console.error(`Missing model at ${MODEL_PATH}. Run: npm run whisper:model ${MODEL}`);
  process.exit(1);
}

async function transcribe(url, tag) {
  const workDir = await mkdtemp(join(tmpdir(), "transcribe-"));

  try {
    log(`${tag} downloading audio`);
    const downloadStart = Date.now();
    await run("yt-dlp", [
      "-x",
      "--audio-format", "wav",
      "--postprocessor-args", "-ar 16000 -ac 1",
      "--no-warnings",
      "-o", join(workDir, "audio.%(ext)s"),
      url,
    ], { timeout: 900_000, maxBuffer: 64 * 1024 * 1024 });

    const audio = join(workDir, "audio.wav");
    const { size } = await stat(audio);
    const minutes = size / (16000 * 2 * 60);
    log(
      `${tag} audio ready: ${minutes.toFixed(1)} min, ${(size / 1024 / 1024).toFixed(0)} MB,`,
      `downloaded in ${((Date.now() - downloadStart) / 1000).toFixed(0)}s`,
    );
    log(`${tag} transcribing with ${MODEL}, expect roughly ${Math.ceil(minutes / 25)} min`);
    const transcribeStart = Date.now();
    await run("whisper-cli", [
      "-m", MODEL_PATH,
      "-f", audio,
      "-ovtt",
      "-of", join(workDir, "out"),
    ], { timeout: 3_600_000, maxBuffer: 64 * 1024 * 1024 });

    log(`${tag} transcribed in ${((Date.now() - transcribeStart) / 1000).toFixed(0)}s`);
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

let requests = 0;

const server = createServer(async (request, response) => {
  const send = (status, payload) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  };

  if (request.method === "GET" && request.url === "/health") {
    return send(200, {
      ok: true,
      model: MODEL,
      answerModel: ANSWER_MODEL,
      uptime: since(),
      requests,
    });
  }

  const isTranscribe = request.method === "POST" && request.url === "/transcribe";
  const isAnswer = request.method === "POST" && request.url === "/answer";

  if (!isTranscribe && !isAnswer) {
    return send(404, { error: "Not found" });
  }

  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    log("rejected a request with a bad or missing token");
    return send(401, { error: "Unauthorized" });
  }

  if (isAnswer) {
    const tag = `#${++requests}`;
    let payload;

    try {
      payload = JSON.parse(await readBody(request));
    } catch {
      return send(400, { error: "Expected a JSON body" });
    }

    const { system, prompt } = payload;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return send(400, { error: "prompt is required" });
    }

    log(`${tag} answering with ${ANSWER_MODEL}, prompt ${prompt.length} chars`);
    const startedAt = Date.now();

    try {
      const upstream = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: ANSWER_MODEL,
          stream: false,
          // Lecture answers should stick to the excerpts, not improvise.
          options: { temperature: 0.2 },
          messages: [
            ...(typeof system === "string" && system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!upstream.ok) {
        throw new Error(`ollama returned ${upstream.status}: ${await upstream.text()}`);
      }

      const data = await upstream.json();
      const text = (data.message?.content ?? "").trim();
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      log(`${tag} answered in ${elapsed}s, ${text.length} chars`);
      return send(200, { text, model: ANSWER_MODEL });
    } catch (error) {
      log(`${tag} answer FAILED after ${Math.round((Date.now() - startedAt) / 1000)}s: ${error.message}`);
      return send(502, { error: "Answering failed" });
    }
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

  const tag = `#${++requests}`;
  const fileName = parsed.pathname.split("/").pop() || parsed.hostname;
  log(`${tag} request from ${parsed.hostname}: ${fileName}`);
  const startedAt = Date.now();

  try {
    const segments = await transcribe(url, tag);
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    const covered = Math.round((segments[segments.length - 1]?.end ?? 0) / 60);
    log(`${tag} done: ${segments.length} segments covering ${covered} min, in ${elapsed}s`);
    send(200, { segments });
  } catch (error) {
    log(`${tag} FAILED after ${Math.round((Date.now() - startedAt) / 1000)}s: ${error.message}`);
    send(502, { error: "Transcription failed" });
  }
});

server.listen(PORT, () => {
  log(`Transcription server listening on http://127.0.0.1:${PORT}`);
  log(`Transcription model: ${MODEL}`);
  log(`Answer model: ${ANSWER_MODEL} via ${OLLAMA_HOST}`);
  log(`Expose it with: ngrok http ${PORT}`);
  log("Waiting for requests. Ctrl+C to stop.");
});

process.on("SIGINT", () => {
  log(`Stopping after ${requests} request(s), up ${since()}.`);
  process.exit(0);
});
