#!/usr/bin/env node
/**
 * Downloads a whisper.cpp model into models/ for the offline fallback.
 *
 *   node scripts/fetch-whisper-model.mjs small.en
 */

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

const BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

const model = process.argv[2] ?? "small.en";
const target = join(process.cwd(), "models", `ggml-${model}.bin`);

if (existsSync(target)) {
  console.log(`Already present: ${target}`);
  process.exit(0);
}

mkdirSync(join(process.cwd(), "models"), { recursive: true });

const response = await fetch(`${BASE_URL}/ggml-${model}.bin`);
if (!response.ok || !response.body) {
  console.error(`Download failed for ggml-${model}.bin (HTTP ${response.status})`);
  process.exit(1);
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
console.log(`Wrote ${target}`);
