import { generateSummary } from "@/lib/answer";
import {
  getLecture,
  getLectureWorkspace,
  saveLecture,
  saveLectureWorkspace,
} from "@/lib/store";
import { buildLecture } from "@/lib/transcript";
import { lectureIdFor, parseVideoSource } from "@/lib/video-source";

// Fetching captions takes seconds; a cold local run can take longer.
export const maxDuration = 300;

type Event =
  | { type: "status"; message: string }
  | { type: "segment"; id: string; start: number; text: string }
  | { type: "done"; lectureId: string; title: string; reused: boolean }
  | { type: "error"; message: string };

function stream(handler: (send: (event: Event) => void) => Promise<void>) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      // Newline-delimited JSON: the client can render each event as it lands
      // instead of waiting for the whole transcript.
      const send = (event: Event) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        await handler(send);
      } catch (error) {
        console.error("Ingest failed", error);
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Could not build a transcript.",
        });
      } finally {
        controller.close();
      }
    },
  });
}

export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const source = parseVideoSource(url);

  if (!source) {
    return Response.json(
      { error: "Paste a YouTube link or a direct link to a video file." },
      { status: 400 },
    );
  }

  const body$ = stream(async (send) => {
    const existing = await getLecture(lectureIdFor(source));
    if (existing) {
      const workspace = await getLectureWorkspace(existing.id);
      if (!workspace.notes.some((note) => note.kind === "summary")) {
        send({ type: "status", message: "Creating the AI summary with GPT Sol" });
        const summary = await generateSummary(existing.title, existing.segments);
        await saveLectureWorkspace(existing.id, {
          ...workspace,
          notes: [
            { id: crypto.randomUUID(), heading: existing.title, body: summary, kind: "summary" },
            ...workspace.notes,
          ],
        });
      } else {
        send({ type: "status", message: "Already transcribed and summarised" });
      }
      send({ type: "done", lectureId: existing.id, title: existing.title, reused: true });
      return;
    }

    const lecture = await buildLecture(source, (message: string) =>
      send({ type: "status", message }),
    );

    for (const segment of lecture.segments) {
      send({ type: "segment", id: segment.id, start: segment.start, text: segment.text });
    }

    send({ type: "status", message: "Creating the AI summary with GPT Sol" });
    const summary = await generateSummary(lecture.title, lecture.segments);

    send({ type: "status", message: "Saving the lecture" });
    await saveLecture(lecture);
    await saveLectureWorkspace(lecture.id, {
      chats: [],
      notes: [
        { id: crypto.randomUUID(), heading: lecture.title, body: summary, kind: "summary" },
      ],
    });

    send({ type: "done", lectureId: lecture.id, title: lecture.title, reused: false });
  });

  return new Response(body$, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
