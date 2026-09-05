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
| Supadata transcript API | `SUPADATA_API_KEY` is set. The only option that works when deployed. |
| `yt-dlp` | no key set. Needs the binary, so local only. |
| `whisper.cpp` (`ggml-small.en`) | a video publishes no captions. Local only. |

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

### Optional command line ingest

The UI does this itself; the script is for loading several lectures at once.

```bash
npm run ingest -- "https://www.youtube.com/watch?v=..."
npm run whisper:model small.en    # only for videos without captions
```

## Project layout

```
src/app/            routes and pages
src/components/     player, transcript panel, chat, URL bar
src/lib/            retrieval, answering, storage, transcripts, parsing
scripts/            command line ingest and model download
supabase/schema.sql the lectures table
```

## Known limits

- Only YouTube videos can be transcribed automatically. Direct video file links
  play, but have no transcript.
- The Whisper fallback is local only; a deployed instance cannot transcribe a
  video that publishes no captions.
- The Notes tab is placeholder content. The Transcript tab is real.
