"use client";

import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { activeSegmentIndex } from "@/lib/segments";
import type { NoteSection, QuizQuestion, TranscriptSegment } from "@/lib/types";
import { AnswerText } from "./AnswerText";
import { QuizPanel } from "./QuizPanel";

export type SourceTab = "transcript" | "summary" | "notes" | "quiz";

type Props = {
  lectureId: string | null;
  lectureTitle: string;
  storedSummary: string | null;
  storedQuiz: QuizQuestion[] | null;
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

export function SourcePanel({ lectureId, lectureTitle, storedSummary, storedQuiz, transcript, notes, currentTime, onSeek, tab, onTabChange, onElaborate }: Props) {
  const [following, setFollowing] = useState(true);
  const [summary, setSummary] = useState(storedSummary);
  const [summaryPending, setSummaryPending] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<NoteSection | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const noteDialogRef = useRef<HTMLDialogElement>(null);

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

  useEffect(() => {
    if (selectedNote) noteDialogRef.current?.showModal();
  }, [selectedNote]);

  async function createSummary() {
    if (!lectureId || summaryPending) return;
    setSummaryPending(true);
    setSummaryError(null);

    try {
      const response = await fetch(`/api/lectures/${lectureId}/summary`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the AI summary.");
      setSummary(data.summary);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Could not create the AI summary.");
    } finally {
      setSummaryPending(false);
    }
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-separator px-3 py-2.5">
        <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-sunken p-0.5">
          {(["transcript", "summary", "notes", "quiz"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onTabChange(value)}
              aria-current={tab === value}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1 text-[13px] font-medium capitalize transition-all duration-200 ${
                tab === value
                  ? "bg-segment text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {value === "summary" && (
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
                  <path d="M8 2.25 9.1 5.4 12.25 6.5 9.1 7.6 8 10.75 6.9 7.6 3.75 6.5 6.9 5.4 8 2.25Zm4.25 7.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
              )}
              {value === "summary" ? "AI summary" : value}
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
            No transcript loaded.
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
                    className={`flex w-full items-start gap-2 rounded-xl py-2.5 pl-2 pr-3 text-left transition-all duration-500 ease-out hover:!opacity-100 ${
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
        ) : tab === "summary" ? (
          summary ? (
            <article className="mx-auto w-full max-w-[72ch] px-4 py-5 sm:px-6">
              <h2 className="display text-balance text-[20px] leading-tight text-foreground">
                {lectureTitle}
              </h2>
              <div className="mt-5 space-y-6">
                {summary.split(/\n\s*\n/).map((block, index) => {
                  const [heading, ...content] = block.split("\n");
                  return (
                    <section key={`${heading}-${index}`}>
                      <h3 className="border-b border-separator pb-2 text-[16px] font-semibold leading-snug text-foreground">
                        {heading}
                      </h3>
                      <p className="mt-3 whitespace-pre-line text-[13.5px] leading-[1.75] text-muted">
                        {content.join("\n")}
                      </p>
                    </section>
                  );
                })}
              </div>
            </article>
          ) : summaryPending ? (
            <div role="status" className="grid min-h-48 place-items-center p-6 text-center">
              <div>
                <svg viewBox="0 0 16 16" className="mx-auto size-6 animate-pulse text-accent-ink" fill="none" aria-hidden="true">
                  <path d="M8 2.25 9.1 5.4 12.25 6.5 9.1 7.6 8 10.75 6.9 7.6 3.75 6.5 6.9 5.4 8 2.25Zm4.25 7.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
                <p className="mt-3 text-[13.5px] font-medium text-foreground">Creating your AI summary</p>
                <p className="mt-1 text-[12px] text-subtle">GPT Sol is reading the full transcript.</p>
              </div>
            </div>
          ) : (
            <div className="grid min-h-48 place-items-center p-6 text-center">
              <div>
                <p className={`text-[13px] leading-relaxed ${summaryError ? "text-danger" : "text-subtle"}`}>
                  {summaryError ?? "Create a detailed study guide from this lecture’s transcript."}
                </p>
                {lectureId && (
                  <button type="button" onClick={() => void createSummary()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover">
                    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                      <path d="M8 2.25 9.1 5.4 12.25 6.5 9.1 7.6 8 10.75 6.9 7.6 3.75 6.5 6.9 5.4 8 2.25Zm4.25 7.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                    </svg>
                    {summaryError ? "Try again" : "Generate summary"}
                  </button>
                )}
                {!lectureId && (
                  <p className="mt-2 text-[12px] text-subtle">Open a lecture first.</p>
                )}
              </div>
            </div>
          )
        ) : tab === "quiz" ? (
          <QuizPanel lectureId={lectureId} storedQuiz={storedQuiz} onSeek={onSeek} />
        ) : notes.length === 0 ? (
          <p className="p-3 text-[13px] leading-relaxed text-subtle">
            Notes you create from chat answers will appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 p-3">
            {notes.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setSelectedNote(section)}
                  aria-haspopup="dialog"
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-separator bg-segment px-4 py-3.5 text-left transition-colors hover:bg-fill"
                >
                  <h3 className="text-[14px] font-semibold leading-snug text-foreground">
                    {section.heading}
                  </h3>
                  <svg viewBox="0 0 16 16" className="mb-0.5 size-4 shrink-0 text-subtle" fill="none" aria-hidden="true">
                    <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <dialog
        ref={noteDialogRef}
        onClose={() => setSelectedNote(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[85dvh] w-[min(42rem,calc(100%-2rem))] rounded-2xl bg-surface p-0 text-foreground shadow-raised backdrop:bg-black/70"
      >
        {selectedNote && (
          <article>
            <header className="flex items-start justify-between gap-4 border-b border-separator px-5 py-4 sm:px-6">
              <h2 className="text-balance text-[18px] font-semibold leading-snug">
                {selectedNote.heading}
              </h2>
              <button
                type="button"
                onClick={() => noteDialogRef.current?.close()}
                aria-label="Close note"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-foreground"
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                  <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            <div className="max-h-[calc(85dvh-4.5rem)] overflow-y-auto px-5 py-5 text-[13.5px] leading-[1.7] text-muted sm:px-6">
              <AnswerText text={selectedNote.body} citations={[]} onCitationClick={() => {}} />
            </div>
          </article>
        )}
      </dialog>
    </section>
  );
}
