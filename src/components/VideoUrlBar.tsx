"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatTimestamp } from "@/lib/format";
import { parseVideoSource } from "@/lib/video-source";

type StreamedSegment = { id: string; start: number; text: string };

export function VideoUrlBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<StreamedSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
            setStatus(event.reused ? "Already transcribed" : "Transcript ready");
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      if (!lectureId) throw new Error("The transcript did not finish.");

      setValue("");
      setPreview([]);
      router.push(`/?lecture=${lectureId}`);
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
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
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
          className={`min-w-0 flex-1 rounded-full border border-edge bg-surface px-4 py-2 text-[14px] text-foreground placeholder:text-subtle outline-none transition-shadow focus:border-transparent focus:shadow-[0_0_0_1.5px_var(--accent-ink)] focus-visible:outline-none disabled:opacity-60 ${
            error ? "border-transparent shadow-[0_0_0_1.5px_var(--danger)]" : ""
          }`}
        />
        <button
          type="submit"
          disabled={value.trim().length === 0 || pending}
          className="shrink-0 rounded-full bg-accent px-5 py-2 text-[14px] font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:bg-fill disabled:text-subtle"
        >
          {pending ? "Loading…" : "Load"}
        </button>
      </div>

      {error && <p className="px-4 text-[12px] text-danger">{error}</p>}

      {!error && status && (
        <p aria-live="polite" className="px-4 text-[12px] text-subtle">
          {status}
          {pending && "…"}
        </p>
      )}

      {preview.length > 0 && (
        <ul className="flex flex-col gap-0.5 px-4 text-[12px] text-subtle">
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
  );
}
