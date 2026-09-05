# Ask the Lecture

Ask a question about a lecture recording and get an answer drawn from that
lecture, with the timestamp it came from. Clicking the timestamp seeks the
video to that moment.

Live: https://ask-the-lecture.vercel.app

## How it works

1. Paste a YouTube URL. The server fetches the video's published captions,
   which already carry timestamps, and merges the short cues into passages
   large enough to answer from.
2. The transcript is stored as JSON, keyed by video id.
3. A question is scored against those passages with BM25, and the best few are
   given to a language model that must answer from them alone and cite the
   passage ids it used.
4. Cited ids resolve back to segment start times, which become the chips under
   each answer. Clicking one seeks the player.

Captions are preferred over speech-to-text because they are already
timestamped and take seconds rather than minutes to fetch. Whisper exists as a
fallback for videos that publish none.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, TypeScript) |
| Styling | Tailwind CSS v4 |
| Hosting | Vercel |
| Database | Supabase (Postgres, `lectures` table with a `jsonb` column) |
| Video playback | YouTube IFrame Player API, and `<video>` for direct file links |
| Retrieval | BM25, implemented in `src/lib/retrieval.ts` |
| Runtime | Node.js 25 |

## Models and APIs

Each integration picks the first option that is configured, so the deployed app
uses hosted services while a laptop with no keys still works offline.

### Answering

| Provider | Model | Used when |
| --- | --- | --- |
| OpenRouter | `openai/gpt-oss-20b` | `OPENROUTER_API_KEY` is set |
| Anthropic | `claude-sonnet-5` | `ANTHROPIC_API_KEY` is set |
| Ollama | `gpt-oss:20b` | neither key is set, local only |

Model ids are overridable with `OPENROUTER_MODEL`, `ANTHROPIC_MODEL` and
`OLLAMA_MODEL`.

### Transcripts

| Source | Used when |
| --- | --- |
| Supadata transcript API | a YouTube link and `SUPADATA_API_KEY` is set. The only YouTube option that works when deployed. |
| `yt-dlp` | a YouTube link and no key set. Needs the binary, so local only. |
| Deepgram (`nova-3`) | a link with no captions, such as a direct MP4, and `DEEPGRAM_API_KEY` is set. Deepgram fetches the URL itself, so the file never passes through the app. |
| `whisper.cpp` (`ggml-small.en`) | a link with no captions and no Deepgram key. Local only. |

Captions and speech to text are separate services because they solve different
problems. A YouTube lecture usually has a timestamped caption track already,
which is faster and cheaper to read than transcribing the audio. A direct media
link has none, so it has to be transcribed. Deepgram cannot stand in for
Supadata either: a YouTube watch page is not a media file, and extracting its
audio stream needs `yt-dlp`, which cannot run on the deployment.

### Storage

| Store | Used when |
| --- | --- |
| Supabase | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set |
| `data/lectures/*.json` | neither is set |

### Other services

- **YouTube oEmbed** for the video title and channel. No key required.

`GET /api/health` reports which of these a running deployment resolved to,
by name and never by value.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | The workspace: player, transcript, notes and chat. `?lecture=<id>` opens one. |
| `/library` | Every ingested lecture, with its transcript source and coverage. |
| `POST /api/ingest` | Builds and stores a transcript. Streams progress as newline-delimited JSON. |
| `POST /api/ask` | Retrieves passages and returns a cited answer. |
| `DELETE /api/lectures/<id>` | Removes a lecture and its transcript from the store. |
| `GET /api/health` | Which integrations are configured. |

## Setup

```bash
npm install
cp .env.example .env.local   # fill in what you need; all of it is optional locally
npm run dev
```

With no environment variables at all, the app stores transcripts on disk and
answers with a local Ollama model. That path needs:

```bash
brew install yt-dlp
ollama pull gpt-oss:20b
```

For the Supabase-backed path, run `supabase/schema.sql` once in the Supabase
SQL editor, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The
service role key bypasses row-level security, so it must stay server-side.

Ingestion happens entirely through the UI. Transcripts are written to the
configured store, never into the repository; `data/lectures/` is only a local
cache used when Supabase is not configured, and is ignored by git.

For videos that publish no captions, the local Whisper fallback needs its model
once:

```bash
npm run whisper:model small.en
```

## Project layout

```
src/app/            routes and pages
src/components/     player, transcript panel, chat, URL bar
src/lib/            retrieval, answering, storage, transcripts, parsing
scripts/            Whisper model download
supabase/schema.sql the lectures table
```

## Known limits

- A deployment without `DEEPGRAM_API_KEY` cannot transcribe a video that has no
  captions, since the local Whisper fallback needs a binary.
- The Notes tab is placeholder content. The Transcript tab is real.
