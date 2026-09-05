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
   given to a language model along with the transcript around the playhead. The
   model must answer from that alone and cite the passage ids it used.
4. Cited ids resolve back to segment start times, which become the chips under
   each answer. Clicking one seeks the player.

Captions are preferred over speech-to-text because they are already
timestamped and take seconds rather than minutes to fetch. Whisper exists as a
fallback for videos that publish none.

## Features

- **Lecture workspace.** Player, source panel and chat in one screen, with a
  draggable split and a layout picker that puts sources or chat on the right.
- **Custom video controls.** Scrubber with a playhead that matches the
  transcript marker, skip, volume, playback rate from 0.5x to 2x, and
  fullscreen — the same controls for YouTube and for direct video files.
- **Transcript that follows the audio.** The spoken line stays centred and
  fades its neighbours; scrolling away pauses the follow, and a *Follow along*
  button resumes it. Clicking any line seeks the player.
- **Elaborate.** One click on the line being spoken asks for an explanation of
  that passage, so "explain this" needs no typing.
- **AI summary tab.** A study guide built from the whole transcript, generated
  on demand and stored with the lecture so it is created once.
- **Notes.** Any chat answer can be kept as a note, with its bullets and
  paragraphs intact.
- **Multiple chats per lecture.** Named threads with history, kept per lecture
  in the browser's own storage, so reopening a lecture brings back the
  conversation.
- **Ask about a paused frame.** Capture the current frame and ask a question
  about the diagram or slide on screen.
- **Library.** Every ingested lecture with its transcript source, duration,
  caption coverage and a delete button.
- **Light and dark themes**, and a lecture switcher in the header.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.3 (App Router, React 19.2, TypeScript 5) |
| Styling | Tailwind CSS v4 |
| Hosting | Vercel |
| Database | Supabase (Postgres, `lectures` table with a `jsonb` column) |
| Client state | `localStorage` through a `useSyncExternalStore` shelf (`src/lib/local-workspace.ts`) |
| Video playback | YouTube IFrame Player API, and `<video>` for direct file links |
| Retrieval | BM25 with playhead anchoring, in `src/lib/retrieval.ts` |
| Side services | Two standalone Node servers, for local transcription and local answering |
| Runtime | Node.js 25 |

## Models and APIs

Each integration picks the first option that is configured, so the deployed app
uses hosted services while a laptop with no keys still works offline.

### Answering a question

| Order | Provider | Model | Source | Used when |
| --- | --- | --- | --- | --- |
| 1 | OpenRouter | `openai/gpt-5.6-luna` | hosted API | `OPENROUTER_API_KEY` is set |
| 2 | Your own machine | `gpt-oss:20b` via Ollama | `npm run answer:server`, reached over a tunnel | `ANSWER_URL` is set |
| 3 | Anthropic | `claude-sonnet-5` | hosted API | `ANTHROPIC_API_KEY` is set |
| 4 | Ollama | `gpt-oss:20b` | local, on this machine | nothing above is set |

The answering model is given the retrieved excerpts *and* a window of the raw
transcript centred on the playhead, so it can follow a point the lecturer
builds over several passages instead of guessing at the gaps. Reasoning effort
is medium on OpenRouter and low on Ollama; temperature is 0.2, because with the
transcript in front of the model invention is the failure to guard against.

Override any of it with `OPENROUTER_MODEL`, `ANTHROPIC_MODEL`, `OLLAMA_MODEL`,
`ANSWER_MODEL`, `ANSWER_REASONING_EFFORT` or `ANSWER_TEMPERATURE`.

### Asking about a captured frame

| Order | Provider | Model | Source | Used when |
| --- | --- | --- | --- | --- |
| 1 | OpenRouter | `openai/gpt-5.6-luna` | hosted API | `OPENROUTER_API_KEY` is set |
| 2 | Anthropic | `claude-sonnet-5` | hosted API | `ANTHROPIC_API_KEY` is set |

The image travels with the question and a separate vision prompt that limits
the model to what is actually visible in the frame. Local Ollama has no vision
model wired up here, so a laptop running only Ollama gets a clear error rather
than a silent failure.

### AI summary

| Provider | Model | Source | Used when |
| --- | --- | --- | --- |
| OpenRouter | `openai/gpt-5.6-sol` | hosted API | `OPENROUTER_API_KEY` is set |

Sol reads the entire transcript in one pass and returns a blocked study guide,
which is stored on the lecture and reused. There is no fallback: without an
OpenRouter key the summary tab says so.

### Transcripts

| Source | Model | Used when |
| --- | --- | --- |
| Supadata transcript API | published captions, no model | a YouTube link and `SUPADATA_API_KEY` is set. The only YouTube option that works when deployed. |
| `yt-dlp` | published captions, no model | a YouTube link and no key set. Needs the binary, so local only. |
| Your own machine | `whisper.cpp` (`ggml-small.en`) | a link with no captions and `TRANSCRIBE_URL` is set. Runs `npm run transcribe:server` here and reaches it through a tunnel. |
| Deepgram | `nova-3` | a link with no captions, such as a direct MP4, and `DEEPGRAM_API_KEY` is set. Deepgram fetches the URL itself, so the file never passes through the app. |
| `whisper.cpp` | `ggml-small.en` | a link with no captions and no Deepgram key. Local only. |

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

Chats and notes are not stored server-side. They live in the browser's
`localStorage`, one shelf per lecture, so a student's work stays on their own
machine and reopening a lecture restores it.

### Other services

- **YouTube oEmbed** for the video title and channel. No key required.
- **YouTube IFrame Player API** for playback of YouTube links.

`GET /api/health` reports which of these a running deployment resolved to,
by name and never by value.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | The workspace: player, transcript, summary, notes and chat. `?lecture=<id>` opens one, `?layout=chat-right` flips the panels. |
| `/library` | Every ingested lecture, with its transcript source and coverage. |
| `POST /api/ingest` | Builds and stores a transcript. Streams progress as newline-delimited JSON. |
| `POST /api/ask` | Retrieves passages and returns a cited answer. Also accepts a captured video frame, for a question about that image. |
| `POST /api/lectures/<id>/summary` | Generates the AI summary once and stores it on the lecture. |
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
brew install ollama
brew services start ollama
ollama pull gpt-oss:20b
npm run answer:server
```

The standalone Node API listens only on this machine. Test it from another
terminal:

```bash
curl http://127.0.0.1:8788/answer \
  -H 'content-type: application/json' \
  -d '{"prompt":"Say hello in one sentence."}'
```

Set `ANSWER_URL=http://127.0.0.1:8788` in `.env.local` to make the app use this
server. On an 8 GB Mac the server uses a 2K context by default; override it with
`ANSWER_CONTEXT` only if the machine has spare memory.

Local YouTube ingestion also needs:

```bash
brew install yt-dlp
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

## Ask about a paused frame

Open an ingested lecture, pause the recording, and click **Capture frame**
below the video. For YouTube and remote videos that block direct capture, use
desktop Chrome or Edge and select the current lecture tab in the browser share
dialog. The app crops to the video area and stops sharing immediately after
capture.

The frame opens in a dialog with its timestamp. Type a specific question and
click **Ask**, or ask with an empty input for “What is happening in this
frame?” Images are held in browser memory and sent with the question; they are
not saved to the lecture library.

Image questions use whichever of `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY` is
configured. Direct same-origin video capture does not require tab sharing;
YouTube region capture requires a compatible desktop browser and HTTPS or
localhost. Browser/OS sharing permission is required for each capture.

### Using this machine as the transcription server

A deployment cannot run whisper.cpp, but it can call a machine that does.

```bash
npm run whisper:model small.en
TRANSCRIBE_TOKEN=$(openssl rand -hex 32) npm run transcribe:server
ngrok http 8787 --domain your-name.ngrok-free.app
```

Then set `TRANSCRIBE_URL` to the tunnel address plus `/transcribe`, and
`TRANSCRIBE_TOKEN` to the same value, wherever the app runs. Measured on an
M4: an 89 minute lecture took 193 seconds and about 1.4 GB of memory.

The request stays open for the whole transcription, so a long recording can
outlast a serverless function's time limit. Deepgram is the safer choice when
that matters.

## Project layout

```
src/app/                 routes and pages
src/components/          player, controls, source panel, chat, URL bar, pickers
src/lib/                 retrieval, answering, storage, transcripts, parsing
src/lib/local-workspace  browser-side chats and notes
scripts/                 Whisper model download, transcription and answer servers
supabase/schema.sql      the lectures table
```

## Known limits

- A deployment without `DEEPGRAM_API_KEY` cannot transcribe a video that has no
  captions, since the local Whisper fallback needs a binary.
- A question about a captured frame needs `OPENROUTER_API_KEY` or
  `ANTHROPIC_API_KEY`; local Ollama has no vision model wired up.
- The AI summary needs `OPENROUTER_API_KEY`; there is no local fallback for it.
- Chats and notes live in the browser, so they do not follow a student to
  another device and are lost if site data is cleared.
