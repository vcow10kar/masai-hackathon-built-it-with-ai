"use client";

import { useState } from "react";
import { formatTimestamp } from "@/lib/format";
import type { ChatMessage, Citation } from "@/lib/types";

type Props = {
  messages: ChatMessage[];
  pending: boolean;
  disabled: boolean;
  error: string | null;
  onSend: (question: string) => void;
  onCitationClick: (citation: Citation) => void;
};

export function ChatPanel({
  messages,
  pending,
  disabled,
  error,
  onSend,
  onCitationClick,
}: Props) {
  const [draft, setDraft] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending || disabled) return;
    onSend(question);
    setDraft("");
  }

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-black/10 dark:border-white/15">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">
            {disabled
              ? "Open a lecture from the library to ask questions about it."
              : "Ask anything about this lecture. Answers link back to the moment they came from."}
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-black/[.06] px-3 py-2 text-sm dark:bg-white/[.10]"
                  : "max-w-[95%] text-sm"
              }
            >
              <p className="whitespace-pre-wrap">{message.content}</p>

              {message.citations && message.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.citations.map((citation, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onCitationClick(citation)}
                      className="rounded-full border border-black/15 px-2 py-0.5 font-mono text-xs tabular-nums transition-colors hover:bg-black/[.04] dark:border-white/20 dark:hover:bg-white/[.06]"
                    >
                      {citation.kind === "transcript"
                        ? formatTimestamp(citation.start)
                        : citation.heading}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {pending && (
          <p className="text-sm text-black/50 dark:text-white/50">Reading the lecture…</p>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-black/10 p-2 dark:border-white/15">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={disabled || pending}
          placeholder={disabled ? "No lecture loaded" : "Ask about this lecture"}
          aria-label="Ask about this lecture"
          className="min-w-0 flex-1 rounded border border-black/15 px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          disabled={draft.trim().length === 0 || pending || disabled}
        >
          {pending ? "Asking…" : "Ask"}
        </button>
      </form>
    </section>
  );
}
