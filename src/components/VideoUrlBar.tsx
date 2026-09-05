"use client";

import { useState } from "react";
import { parseVideoSource, type VideoSource } from "@/lib/video-source";

type Props = {
  onLoad: (source: VideoSource) => void;
};

export function VideoUrlBar({ onLoad }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const source = parseVideoSource(value);
    if (!source) {
      setError("Paste a YouTube link or a direct link to a video file.");
      return;
    }
    setError(null);
    onLoad(source);
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
          placeholder="Paste the lecture video URL"
          aria-label="Lecture video URL"
          aria-invalid={error !== null}
          className="min-w-0 flex-1 rounded border border-black/15 px-3 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={value.trim().length === 0}
          className="shrink-0 rounded bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Load
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
