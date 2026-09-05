"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatTimestamp } from "@/lib/format";
import { parseVideoSource } from "@/lib/video-source";
import { useClosedLectures } from "@/lib/local-workspace";
import type { WorkspaceLayout } from "@/components/LectureWorkspace";

type StreamedSegment = { id: string; start: number; text: string };

type Props = {
  lectures: { id: string; title: string }[];
  activeLectureId?: string;
  layout: WorkspaceLayout;
};

export function VideoUrlBar({ lectures, activeLectureId, layout }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<StreamedSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [closed, setClosed] = useClosedLectures();

  // A closed lecture stays out of the bar until it is opened again, but the one
  // being watched is always shown: arriving from the library reopens its tab.
  const openLectures = lectures.filter(
    (lecture) => lecture.id === activeLectureId || !closed.includes(lecture.id),
  );

  /** Puts a lecture away without touching the transcript the library holds. */
  function closeLecture(lectureId: string) {
    setClosed((current) => (current.includes(lectureId) ? current : [...current, lectureId]));

    if (lectureId !== activeLectureId) return;
    // The tab being watched has gone, so move to whatever is still open.
    const next = openLectures.find((lecture) => lecture.id !== lectureId);
    router.push(next ? `/?lecture=${next.id}&layout=${layout}` : "/");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    const source = parseVideoSource(value);
    if (!source) {
      setError("Paste a YouTube link or a direct link to a video file.");
      return;
    }

    setError(null);
    setPreview([]);
    setPending(true);
    setStatus("Starting");

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: source.url }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not load that video.");
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let lectureId: string | null = null;

      // The route sends newline-delimited JSON, so each completed line can be
      // shown the moment it arrives.
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;

        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === "status") setStatus(event.message);
          else if (event.type === "segment") {
            setPreview((current) => [...current.slice(-2), event]);
          } else if (event.type === "done") {
            lectureId = event.lectureId;
            setStatus(event.reused ? "Lecture ready" : "Transcript and AI summary ready");
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      if (!lectureId) throw new Error("The transcript did not finish.");

      setValue("");
      setPreview([]);
      dialogRef.current?.close();
      router.push(`/?lecture=${lectureId}&layout=${layout}`);
      router.refresh();
    } catch (cause) {
      setStatus(null);
      setPreview([]);
      setError(cause instanceof Error ? cause.message : "Could not load that video.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center">
      <nav
        aria-label="Open lectures"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {openLectures.map((lecture) => {
          const active = lecture.id === activeLectureId;
          return (
            <span
              key={lecture.id}
              className={`group flex h-9 max-w-52 shrink-0 items-center rounded-lg border pr-1 text-[12px] font-medium transition-colors ${
                active
                  ? "border-accent-line bg-accent-wash text-foreground"
                  : "border-edge bg-surface text-muted hover:bg-fill hover:text-foreground"
              }`}
            >
              <Link
                href={{ pathname: "/", query: { lecture: lecture.id, layout } }}
                scroll={false}
                aria-current={active ? "page" : undefined}
                title={lecture.title}
                className="flex min-w-0 items-center gap-2 py-2 pl-3 pr-1"
              >
                <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
                  <rect x="1.5" y="3" width="13" height="10" rx="2" stroke="currentColor" />
                  <path d="m6.5 6 4 2-4 2V6Z" fill="currentColor" />
                </svg>
                <span className="truncate">{lecture.title}</span>
              </Link>
              <button
                type="button"
                onClick={() => closeLecture(lecture.id)}
                aria-label={`Close ${lecture.title}`}
                title="Close tab, the lecture stays in the library"
                className="grid size-5 shrink-0 place-items-center rounded-full opacity-0 transition-all hover:bg-fill hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
              >
                <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden="true">
                  <path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </span>
          );
        })}

        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold text-accent-ink transition-colors hover:bg-accent-wash"
        >
          <span className="text-lg font-light leading-none" aria-hidden="true">+</span>
          New lecture
        </button>
      </nav>

      <dialog
        ref={dialogRef}
        aria-labelledby="add-lecture-title"
        onClick={(event) => event.target === event.currentTarget && dialogRef.current?.close()}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-edge bg-surface p-0 text-foreground shadow-raised backdrop:bg-black/70"
      >
        <div className="flex items-start justify-between gap-4 border-b border-separator px-5 py-4">
          <div>
            <h2 id="add-lecture-title" className="display text-[19px]">Add a lecture</h2>
            <p className="mt-1 text-[12px] text-subtle">Paste a YouTube or direct video link.</p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close add lecture dialog"
            className="grid size-8 shrink-0 place-items-center rounded-full text-xl text-muted hover:bg-fill hover:text-foreground"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2 p-5">
          <div className="flex gap-2">
            <input
              autoFocus
              type="url"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) setError(null);
              }}
              disabled={pending}
              placeholder="Paste the lecture video URL"
              aria-label="Lecture video URL"
              aria-invalid={error !== null}
              className={`min-w-0 flex-1 rounded-xl border border-edge bg-background px-4 py-2.5 text-[14px] text-foreground placeholder:text-subtle outline-none transition-shadow focus:border-transparent focus:shadow-[0_0_0_1.5px_var(--accent-ink)] focus-visible:outline-none disabled:opacity-60 ${
                error ? "border-transparent shadow-[0_0_0_1.5px_var(--danger)]" : ""
              }`}
            />
            <button
              type="submit"
              disabled={value.trim().length === 0 || pending}
              className="shrink-0 rounded-xl bg-accent px-5 py-2.5 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:bg-fill disabled:text-subtle"
            >
              {pending ? "Loading…" : "Add"}
            </button>
          </div>

          {error && <p className="px-1 text-[12px] text-danger">{error}</p>}

          {!error && status && (
            <p aria-live="polite" className="px-1 text-[12px] text-subtle">
              {status}
              {pending && "…"}
            </p>
          )}

          {preview.length > 0 && (
            <ul className="flex flex-col gap-0.5 px-1 text-[12px] text-subtle">
              {preview.map((segment) => (
                <li key={segment.id} className="truncate">
                  <span className="font-mono tabular-nums text-accent-ink">
                    {formatTimestamp(segment.start)}
                  </span>{" "}
                  {segment.text}
                </li>
              ))}
            </ul>
          )}
        </form>
      </dialog>
    </div>
  );
}
