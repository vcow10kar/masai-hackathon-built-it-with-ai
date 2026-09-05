"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseVideoSource } from "@/lib/video-source";

export function VideoUrlBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
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
    setPending(true);
    setStatus("Fetching the transcript…");

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: source.url }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load that video.");

      setStatus(data.reused ? "Already transcribed." : "Transcript ready.");
      setValue("");
      router.push(`/?lecture=${data.lectureId}`);
      router.refresh();
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : "Could not load that video.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
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
          className="min-w-0 flex-1 rounded border border-black/15 px-3 py-1.5 text-sm outline-none focus:border-black/40 disabled:opacity-60 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={value.trim().length === 0 || pending}
          className="shrink-0 rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Loading…" : "Load"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {!error && status && (
        <p className="text-xs text-black/50 dark:text-white/50">{status}</p>
      )}
    </form>
  );
}
