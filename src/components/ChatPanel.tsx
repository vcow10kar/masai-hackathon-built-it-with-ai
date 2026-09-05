"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import type { ChatMessage, Citation, FrameAttachment } from "@/lib/types";

type Props = {
  messages: ChatMessage[];
  pending: boolean;
  disabled: boolean;
  error: string | null;
  capturedFrame: FrameAttachment | null;
  onFrameRemove: () => void;
  onSend: (question: string, frame?: FrameAttachment) => void;
  onCitationClick: (citation: Citation) => void;
};

export function ChatPanel({
  messages,
  pending,
  disabled,
  error,
  capturedFrame,
  onFrameRemove,
  onSend,
  onCitationClick,
}: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending, capturedFrame]);

  useEffect(() => {
    if (capturedFrame) inputRef.current?.focus({ preventScroll: true });
  }, [capturedFrame]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim() || (capturedFrame ? "What is happening in this frame?" : "");
    if (!question || pending || disabled) return;
    onSend(question, capturedFrame ?? undefined);
    setDraft("");
    if (capturedFrame) onFrameRemove();
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {messages.length === 0 ? (
          <p className="max-w-sm text-[13.5px] leading-relaxed text-subtle">
            {disabled
              ? "Open a lecture from the library to ask questions about it."
              : "Ask anything about this lecture. Every answer carries the timestamps it was read from — click one to jump there."}
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md border border-edge bg-segment px-3.5 py-2 text-[14px] text-foreground"
                  : "max-w-[95%] text-[14px] leading-[1.55] text-foreground"
              }
            >
              {message.frame && (
                <Image
                  src={message.frame.dataUrl}
                  alt={`Captured lecture frame at ${formatTimestamp(message.frame.timestamp)}`}
                  width={320}
                  height={180}
                  unoptimized
                  className="mb-2 max-h-40 w-full rounded-xl object-contain"
                />
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>

              {message.citations && message.citations.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {message.citations.map((citation, index) =>
                    // Gold means there is a moment to jump to. A note has no
                    // position in the recording, so it stays grey and inert.
                    citation.kind === "transcript" ? (
                      <button
                        key={index}
                        type="button"
                        onClick={() => onCitationClick(citation)}
                        className="rounded-full bg-accent-wash px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-accent-ink transition-colors hover:bg-accent-wash-hover"
                      >
                        {formatTimestamp(citation.start)}
                      </button>
                    ) : (
                      <span
                        key={index}
                        className="rounded-full border border-separator px-2.5 py-1 text-[11px] font-medium text-muted"
                      >
                        {citation.heading}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {capturedFrame && (
          <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-sunken p-2">
            <Image
              src={capturedFrame.dataUrl}
              alt={`Captured lecture frame at ${formatTimestamp(capturedFrame.timestamp)}`}
              width={128}
              height={72}
              unoptimized
              className="h-10 w-16 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium">
                Frame at {formatTimestamp(capturedFrame.timestamp)}
              </p>
              <p className="text-[11.5px] text-subtle">Ready to ask</p>
            </div>
          </div>
        )}

        {pending && (
          <p role="status" className="text-[13.5px] text-subtle">
            {messages.at(-1)?.frame ? "Looking at the frame…" : "Reading the transcript…"}
          </p>
        )}

        {error && <p className="text-[13.5px] text-danger">{error}</p>}
      </div>

      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-separator p-3">
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled || pending}
          placeholder={
            disabled ? "No lecture loaded" : capturedFrame ? "Ask about this frame" : "Ask about this lecture"
          }
          aria-label={capturedFrame ? "Ask about this frame" : "Ask about this lecture"}
          className="min-w-0 flex-1 rounded-full bg-sunken px-4 py-2 text-[14px] text-foreground placeholder:text-subtle outline-none transition-shadow focus:shadow-[inset_0_0_0_1.5px_var(--accent-ink)] focus-visible:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          aria-label={capturedFrame ? "Ask about captured frame" : "Ask"}
          className={`grid h-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-all duration-200 hover:bg-accent-hover disabled:bg-fill disabled:text-subtle ${
            capturedFrame ? "px-4 text-[12.5px] font-semibold" : "w-8"
          }`}
          disabled={disabled || pending || (!capturedFrame && draft.trim().length === 0)}
        >
          {capturedFrame ? (
            "Ask"
          ) : (
            <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
              <path
                d="M8 13V3.5M8 3.5L3.75 7.75M8 3.5l4.25 4.25"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </form>
    </section>
  );
}
