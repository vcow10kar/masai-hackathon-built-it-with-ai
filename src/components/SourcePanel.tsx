"use client";

import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { activeSegmentIndex } from "@/lib/segments";
import type { NoteSection, TranscriptSegment } from "@/lib/types";

export type SourceTab = "transcript" | "notes";

type Props = {
  transcript: TranscriptSegment[];
  notes: NoteSection[];
  /** Playback position, or null before anything has played. */
  currentTime: number | null;
  onSeek: (seconds: number) => void;
  tab: SourceTab;
  onTabChange: (tab: SourceTab) => void;
  onElaborate: (segment: TranscriptSegment) => void;
};

/** Lines fade with distance from the one playing, so the eye lands on it. */
function opacityFor(distance: number) {
  if (distance === 0) return 1;
  if (distance === 1) return 0.6;
  if (distance === 2) return 0.42;
  return 0.3;
}

export function SourcePanel({ transcript, notes, currentTime, onSeek, tab, onTabChange, onElaborate }: Props) {
  const [following, setFollowing] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const activeIndex = activeSegmentIndex(transcript, currentTime);
  const activeId = activeIndex >= 0 ? transcript[activeIndex].id : null;

  // Keep the spoken line in view, unless the reader has scrolled away to read
  // somewhere else.
  useEffect(() => {
    if (!following || tab !== "transcript" || !activeRef.current) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    activeRef.current.scrollIntoView({
      block: "center",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [activeId, following, tab]);

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-separator px-3 py-2.5">
        <div className="flex gap-0.5 rounded-[10px] bg-sunken p-0.5">
          {(["transcript", "notes"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              aria-current={tab === value}
              className={`rounded-lg px-3.5 py-1 text-[13px] font-medium capitalize transition-all duration-200 ${
                tab === value
                  ? "bg-segment text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {value}
            </button>
          ))}
        </div>

        {tab === "transcript" && activeId && !following && (
          <button
            type="button"
            onClick={() => setFollowing(true)}
            className="rounded-full bg-accent-wash px-3 py-1 text-[12px] font-medium text-accent-ink transition-colors hover:bg-accent-wash-hover"
          >
            Follow along
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onWheel={() => setFollowing(false)}
        onTouchMove={() => setFollowing(false)}
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {tab === "transcript" && transcript.length === 0 ? (
          <p className="p-3 text-[13px] leading-relaxed text-subtle">
            No transcript loaded. Ingest one with{" "}
            <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[12px] text-accent-ink">
              npm run ingest -- &lt;video url&gt;
            </code>
            , then open it from the library.
          </p>
        ) : tab === "transcript" ? (
          <ul className="flex flex-col gap-0.5">
            {transcript.map((segment, index) => {
              const isActive = index === activeIndex;

              return (
                <li key={segment.id} ref={isActive ? activeRef : null} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSeek(segment.start);
                      setFollowing(true);
                    }}
                    aria-current={isActive}
                    style={{
                      opacity: activeIndex < 0 ? 1 : opacityFor(Math.abs(index - activeIndex)),
                    }}
                    className={`flex w-full items-start gap-2 rounded-xl py-2.5 pl-2 text-left transition-all duration-500 ease-out hover:!opacity-100 ${
                      isActive ? "pr-28" : "pr-3"
                    } ${
                      isActive
                        ? "bg-accent-wash text-foreground"
                        : "text-muted hover:bg-fill"
                    }`}
                  >
                    {/* The same amber dot as the scrubber's playhead: one
                        object, marking the position in two places at once. */}
                    <span
                      aria-hidden="true"
                      className={`mt-[7px] size-1.5 shrink-0 rounded-full bg-accent transition-opacity duration-500 ease-out ${
                        isActive ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span
                      className={`shrink-0 pt-0.5 font-mono text-[11px] tabular-nums ${
                        isActive ? "font-medium text-accent-ink" : "text-subtle"
                      }`}
                    >
                      {formatTimestamp(segment.start)}
                    </span>
                    <span
                      className={`min-w-0 text-[13.5px] leading-[1.55] ${
                        isActive ? "font-medium" : ""
                      }`}
                    >
                      {segment.text}
                    </span>
                  </button>
                  {isActive && (
                    <button
                      type="button"
                      onClick={() => onElaborate(segment)}
                      className="absolute bottom-2.5 right-3 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink shadow-card backdrop-blur transition-colors hover:bg-accent-wash-hover"
                    >
                      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
                        <path d="M8 2.25 9.1 5.4 12.25 6.5 9.1 7.6 8 10.75 6.9 7.6 3.75 6.5 6.9 5.4 8 2.25Zm4.25 7.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                      </svg>
                      Elaborate
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : notes.length === 0 ? (
          <p className="p-3 text-[13px] leading-relaxed text-subtle">
            Notes you create from chat answers will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-4 p-3">
            {notes.map((section) => (
              <li key={section.id}>
                <h3 className="overline text-foreground">{section.heading}</h3>
                <p className="mt-1.5 text-[13.5px] leading-[1.6] text-muted">{section.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
