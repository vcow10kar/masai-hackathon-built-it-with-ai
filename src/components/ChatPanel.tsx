"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import type { ChatMessage, ChatThread, Citation, FrameAttachment } from "@/lib/types";

type Props = {
  chats: ChatThread[];
  activeChatId: string;
  disabled: boolean;
  capturedFrame: FrameAttachment | null;
  onChatSelect: (id: string) => void;
  onNewChat: () => void;
  onFrameRemove: () => void;
  onSend: (question: string, frame?: FrameAttachment, newChat?: boolean) => void;
  onCitationClick: (citation: Citation) => void;
  onAddNote: (message: ChatMessage) => void;
  addingNoteId: string | null;
};

export function ChatPanel({ chats, activeChatId, disabled, capturedFrame, onChatSelect, onNewChat, onFrameRemove, onSend, onCitationClick, onAddNote, addingNoteId }: Props) {
  const [draft, setDraft] = useState("");
  const [frameDraft, setFrameDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const frameInputRef = useRef<HTMLTextAreaElement>(null);
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const messages = activeChat?.messages ?? [];
  const pending = activeChat?.pending ?? false;
  const error = activeChat?.error ?? null;

  useEffect(() => {
    const scroller = scrollRef.current;
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending, activeChatId]);

  useEffect(() => {
    if (!capturedFrame) return;
    frameInputRef.current?.focus({ preventScroll: true });
  }, [capturedFrame]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, [activeChatId]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending || disabled) return;
    onSend(question);
    setDraft("");
  }

  function submitFrame(event: React.FormEvent) {
    event.preventDefault();
    const question = frameDraft.trim();
    if (!question || !capturedFrame || disabled) return;
    onSend(question, capturedFrame, true);
    closeFrame();
  }

  function closeFrame() {
    setFrameDraft("");
    onFrameRemove();
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-separator px-3 pt-2" aria-label="Chats">
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            aria-pressed={chat.id === activeChatId}
            onClick={() => onChatSelect(chat.id)}
            className={`max-w-44 shrink-0 truncate rounded-t-lg border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors ${chat.id === activeChatId ? "border-accent text-foreground" : "border-transparent text-subtle hover:text-foreground"}`}
          >
            {chat.title}
          </button>
        ))}
        <button type="button" onClick={onNewChat} aria-label="Start a new chat" title="New chat" className="mb-1 grid size-7 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-foreground">
          <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
        {messages.length === 0 ? (
          <p className="max-w-sm text-[13.5px] leading-relaxed text-subtle">
            {disabled ? "Open a lecture from the library to ask questions about it." : "Ask anything about this lecture. Every answer carries the timestamps it was read from — click one to jump there."}
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={message.role === "user" ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md border border-edge bg-segment px-3.5 py-2 text-[14px] text-foreground" : "max-w-[95%] text-[14px] leading-[1.55] text-foreground"}>
              {message.frame && (
                <Image src={message.frame.dataUrl} alt={`Captured lecture frame at ${formatTimestamp(message.frame.timestamp)}`} width={320} height={180} unoptimized className="mb-2 max-h-40 w-full rounded-xl object-contain" />
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>

              {message.citations && message.citations.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {message.citations.map((citation, index) => citation.kind === "transcript" ? (
                    <button key={index} type="button" onClick={() => onCitationClick(citation)} className="rounded-full bg-accent-wash px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-accent-ink transition-colors hover:bg-accent-wash-hover">
                      {formatTimestamp(citation.start)}
                    </button>
                  ) : (
                    <span key={index} className="rounded-full border border-separator px-2.5 py-1 text-[11px] font-medium text-muted">{citation.heading}</span>
                  ))}
                </div>
              )}
              {message.role === "assistant" && (
                <button
                  type="button"
                  onClick={() => onAddNote(message)}
                  disabled={addingNoteId !== null}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-separator px-2.5 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-fill hover:text-foreground disabled:opacity-50"
                >
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
                    <path d="M8 2.25 9.1 5.4 12.25 6.5 9.1 7.6 8 10.75 6.9 7.6 3.75 6.5 6.9 5.4 8 2.25Zm4.25 7.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  </svg>
                  {addingNoteId === message.id ? "Creating note…" : "Add to notes"}
                </button>
              )}
            </div>
          ))
        )}

        {pending && <p role="status" className="text-[13.5px] text-subtle">{messages.at(-1)?.frame ? "Looking at the frame…" : "Reading the transcript…"}</p>}
        {error && <p className="text-[13.5px] text-danger">{error}</p>}
      </div>

      <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-t border-separator p-3">
        <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={disabled || pending} placeholder={disabled ? "No lecture loaded" : "Ask about this lecture"} aria-label="Ask about this lecture" className="min-w-0 flex-1 rounded-full bg-sunken px-4 py-2 text-[14px] text-foreground placeholder:text-subtle outline-none transition-shadow focus:shadow-[inset_0_0_0_1.5px_var(--accent-ink)] focus-visible:outline-none disabled:opacity-50" />
        <button type="submit" aria-label="Ask" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-all duration-200 hover:bg-accent-hover disabled:bg-fill disabled:text-subtle" disabled={disabled || pending || draft.trim().length === 0}>
          <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
            <path d="M8 13V3.5M8 3.5L3.75 7.75M8 3.5l4.25 4.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      {capturedFrame && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="frame-question-title" onMouseDown={(event) => { if (event.target === event.currentTarget) closeFrame(); }} onKeyDown={(event) => { if (event.key === "Escape") closeFrame(); }}>
          <div className="panel-raised max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-edge bg-surface">
            <div className="flex items-center justify-between border-b border-separator px-5 py-4">
              <div>
                <h2 id="frame-question-title" className="display text-lg">Ask about this moment</h2>
                <p className="mt-0.5 font-mono text-[11px] text-accent-ink">{formatTimestamp(capturedFrame.timestamp)}</p>
              </div>
              <button type="button" onClick={closeFrame} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-foreground">
                <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                  <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="grid md:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)]">
              <div className="grid min-h-64 place-items-center bg-black p-4">
                <Image src={capturedFrame.dataUrl} alt={`Current lecture frame at ${formatTimestamp(capturedFrame.timestamp)}`} width={1280} height={720} unoptimized className="max-h-[60vh] w-full rounded-xl object-contain" />
              </div>
              <form onSubmit={submitFrame} className="flex min-h-64 flex-col gap-4 border-t border-separator p-5 md:border-l md:border-t-0">
                <label htmlFor="frame-question" className="text-[13px] font-semibold">What would you like to know?</label>
                <textarea ref={frameInputRef} id="frame-question" value={frameDraft} onChange={(event) => setFrameDraft(event.target.value)} placeholder="Ask about the diagram, text, or idea on screen…" rows={6} className="min-h-32 flex-1 resize-none rounded-xl bg-sunken p-3 text-[14px] leading-relaxed text-foreground placeholder:text-subtle outline-none transition-shadow focus:shadow-[inset_0_0_0_1.5px_var(--accent-ink)] focus-visible:outline-none" />
                <button type="submit" disabled={frameDraft.trim().length === 0} className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:bg-fill disabled:text-subtle">Ask</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
