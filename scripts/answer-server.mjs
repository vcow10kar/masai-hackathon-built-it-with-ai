#!/usr/bin/env node

import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 8788);
const MODEL = process.env.ANSWER_MODEL ?? "gpt-oss:20b";
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const MAX_BODY_SIZE = 1_000_000;

function send(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;

    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        tooLarge = true;
        body = "";
        reject(new Error("Body too large"));
      }
    });
    request.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Expected a JSON body"));
      }
    });
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    try {
      const upstream = await fetch(`${OLLAMA_HOST}/api/tags`);
      const data = await upstream.json();
      const installed = upstream.ok && data.models?.some(({ name }) => name === MODEL);
      return send(response, installed ? 200 : 503, { ok: installed, model: MODEL });
    } catch {
      return send(response, 503, { ok: false, model: MODEL });
    }
  }

  if (request.method !== "POST" || request.url !== "/answer") {
    return send(response, 404, { error: "Not found" });
  }

  let payload;
  try {
    payload = await readJson(request);
  } catch (error) {
    return send(response, error.message === "Body too large" ? 413 : 400, { error: error.message });
  }

  const { system, prompt } = payload;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return send(response, 400, { error: "prompt is required" });
  }

  try {
    const upstream = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        think: false,
        keep_alive: "2m",
        options: {
          temperature: 0.2,
          num_ctx: Number(process.env.ANSWER_CONTEXT ?? 2048),
          num_predict: Number(process.env.ANSWER_MAX_TOKENS ?? 512),
        },
        messages: [
          ...(typeof system === "string" && system ? [{ role: "system", content: system }] : []),
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!upstream.ok) throw new Error(`Ollama returned ${upstream.status}`);

    const data = await upstream.json();
    const text = data.message?.content?.trim();
    if (!text) throw new Error("Ollama returned an empty answer");

    return send(response, 200, { text, model: MODEL });
  } catch (error) {
    console.error(error.message);
    return send(response, 502, { error: "Model request failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Answer API listening on http://${HOST}:${PORT}`);
  console.log(`POST /answer using ${MODEL}`);
});
