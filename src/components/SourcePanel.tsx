"use client";

import { useState } from "react";
import { formatTimestamp } from "@/lib/format";
import type { NoteSection, TranscriptSegment } from "@/lib/types";

type Tab = "transcript" | "notes";

type Props = {
  transcript: TranscriptSegment[];
  notes: NoteSection[];
  activeSegmentId: string | null;
  onSeek: (seconds: number, segmentId: string) => void;
};

export function SourcePanel({ transcript, notes, activeSegmentId, onSeek }: Props) {
  const [tab, setTab] = useState<Tab>("transcript");

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-black/10 dark:border-white/15">
      <div className="flex shrink-0 gap-1 border-b border-black/10 p-1 dark:border-white/15">
        {(["transcript", "notes"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value}
            className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              tab === value
                ? "bg-black/[.06] dark:bg-white/[.10]"
                : "text-black/60 hover:bg-black/[.04] dark:text-white/60 dark:hover:bg-white/[.06]"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "transcript" && transcript.length === 0 ? (
          <p className="p-2 text-sm text-black/50 dark:text-white/50">
            No transcript loaded. Ingest one with{" "}
            <code className="font-mono text-xs">npm run ingest -- &lt;video url&gt;</code>, then
            open it from the library.
          </p>
        ) : tab === "transcript" ? (
          <ul className="flex flex-col gap-0.5">
            {transcript.map((segment) => (
              <li key={segment.id}>
                <button
                  type="button"
                  onClick={() => onSeek(segment.start, segment.id)}
                  className={`flex w-full gap-3 rounded p-2 text-left text-sm transition-colors ${
                    segment.id === activeSegmentId
                      ? "bg-black/[.06] dark:bg-white/[.10]"
                      : "hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                  }`}
                >
                  <span className="shrink-0 font-mono text-xs tabular-nums text-black/50 dark:text-white/50">
                    {formatTimestamp(segment.start)}
                  </span>
                  <span className="min-w-0">{segment.text}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-3 p-2">
            {notes.map((section) => (
              <li key={section.id}>
                <h3 className="text-sm font-medium">{section.heading}</h3>
                <p className="text-sm text-black/60 dark:text-white/60">{section.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
