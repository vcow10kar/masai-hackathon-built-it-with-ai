"use client";

import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { LecturePlayer, type SeekRequest } from "@/components/LecturePlayer";
import { SourcePanel, type SourceTab } from "@/components/SourcePanel";
import { useStoredChats, useStoredNotes } from "@/lib/local-workspace";
import { activeSegmentIndex } from "@/lib/segments";
import { parseVideoSource, type VideoSource } from "@/lib/video-source";
import type {
  ChatMessage,
  Citation,
  FrameAttachment,
  LectureWorkspaceData,
  TranscriptSegment,
} from "@/lib/types";

export type WorkspaceLecture = {
  id: string;
  title: string;
  uploader: string;
  url: string;
  segments: TranscriptSegment[];
  summary: string | null;
};

export type WorkspaceLayout = "chat-right" | "sources-right";

type Props = {
  lecture: WorkspaceLecture | null;
  initialWorkspace: LectureWorkspaceData;
  layout: WorkspaceLayout;
};

const clampSplit = (value: number, size: number, before: number, after: number) =>
  Math.min(((size - after - 8) / size) * 100, Math.max((before / size) * 100, value));

export function LectureWorkspace({ lecture, initialWorkspace, layout }: Props) {
  const source: VideoSource | null = lecture ? parseVideoSource(lecture.url) : null;
  // Chats and notes are this browser's own. Whatever the server still holds
  // for this lecture seeds the shelf the first time it is opened here, so work
  // from before they moved into the browser is not lost.
  const seedChats = useMemo(
    () =>
      initialWorkspace.chats.length > 0
        ? initialWorkspace.chats
        : [{ id: "chat-1", title: "Chat 1", messages: [], pending: false, error: null }],
    [initialWorkspace.chats],
  );
  const [chats, setChats] = useStoredChats(lecture?.id ?? null, seedChats);
  const [notes, setNotes] = useStoredNotes(lecture?.id ?? null, initialWorkspace.notes);
  const [activeChatId, setActiveChatId] = useState(seedChats[0].id);
  const [sourceTab, setSourceTab] = useState<SourceTab>("transcript");
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<FrameAttachment | null>(null);
  const [panelSplit, setPanelSplit] = useState(61);
  const [videoSplit, setVideoSplit] = useState(60);
  const workspaceRef = useRef<HTMLElement>(null);
  const videoStackRef = useRef<HTMLDivElement>(null);

  const transcript = lecture?.segments ?? [];

  // The player reports its position several times a second; the transcript
  // only cares which segment is being spoken, so re-render when that changes.
  const reportedTime = useRef<number | null>(null);

  function handleTimeChange(seconds: number) {
    const previous = reportedTime.current;
    if (
      previous !== null &&
      activeSegmentIndex(transcript, seconds) === activeSegmentIndex(transcript, previous)
    ) {
      return;
    }
    reportedTime.current = seconds;
    setCurrentTime(seconds);
  }

  // The nonce makes repeat seeks to the same second distinct, so clicking the
  // same citation twice still moves the player.
  function seek(seconds: number) {
    setSeekRequest({ seconds, nonce: Date.now() });
    reportedTime.current = seconds;
    setCurrentTime(seconds);
  }

  function handleCitationClick(citation: Citation) {
    if (citation.kind === "transcript") {
      seek(citation.start);
    }
  }

  /**
   * Closing a chat removes it. The last one is replaced rather than left at
   * none, so the panel always has somewhere to type.
   */
  function deleteChat(id: string) {
    const remaining = chats.filter((chat) => chat.id !== id);

    if (remaining.length === 0) {
      const fresh = { id: crypto.randomUUID(), title: "Chat 1", messages: [], pending: false, error: null };
      setChats([fresh]);
      setActiveChatId(fresh.id);
      return;
    }

    setChats(remaining);
    if (id === activeChatId) setActiveChatId(remaining[remaining.length - 1].id);
  }

  function addChat() {
    const id = crypto.randomUUID();
    setChats((current) => [
      ...current,
      { id, title: `Chat ${current.length + 1}`, messages: [], pending: false, error: null },
    ]);
    setActiveChatId(id);
  }

  function resizePanels(clientX: number) {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;

    const width = bounds.width - 16;
    setPanelSplit(clampSplit(((clientX - bounds.left - 8) / width) * 100, width, 320, 352));
  }

  function handleResizeKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const width = (workspaceRef.current?.clientWidth ?? 0) - 16;
    if (width <= 0) return;
    setPanelSplit((current) =>
      clampSplit(current + (event.key === "ArrowLeft" ? -2 : 2), width, 320, 352),
    );
  }

  function handleResizeStart(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizePanels(event.clientX);
  }

  function resizeVideo(clientY: number) {
    const bounds = videoStackRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setVideoSplit(
      clampSplit(((clientY - bounds.top) / bounds.height) * 100, bounds.height, 256, 192),
    );
  }

  function handleVideoResizeKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const height = videoStackRef.current?.clientHeight ?? 0;
    if (height <= 0) return;
    setVideoSplit((current) =>
      clampSplit(current + (event.key === "ArrowUp" ? -2 : 2), height, 256, 192),
    );
  }

  function handleVideoResizeStart(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeVideo(event.clientY);
  }

  async function handleSend(
    question: string,
    frame?: FrameAttachment,
    newChat = false,
    atTime = currentTime,
  ) {
    if (!lecture) return;

    const askedAt = Date.now();
    const chatId = newChat ? crypto.randomUUID() : activeChatId;
    const currentChat = chats.find((chat) => chat.id === activeChatId);
    const history = newChat
      ? []
      : (currentChat?.messages ?? []).map(({ role, content }) => ({ role, content }));
    const userMessage: ChatMessage = {
      id: `${askedAt}-user`,
      role: "user",
      content: question,
      frame,
    };

    if (newChat) {
      setChats((current) => [
        ...current,
        {
          id: chatId,
          title: question.length > 28 ? `${question.slice(0, 28)}…` : question,
          messages: [userMessage],
          pending: true,
          error: null,
        },
      ]);
      setActiveChatId(chatId);
    } else {
      setChats((current) =>
        current.map((chat) =>
          chat.id === chatId
            ? { ...chat, messages: [...chat.messages, userMessage], pending: true, error: null }
            : chat,
        ),
      );
    }

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The playhead goes along so that "explain this" resolves to whatever
        // is on screen rather than to a keyword match elsewhere in the lecture.
        body: JSON.stringify({
          lectureId: lecture.id,
          question,
          history,
          frame,
          atTime: frame?.timestamp ?? atTime,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");

      setChats((current) =>
        current.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    id: `${askedAt}-assistant`,
                    role: "assistant",
                    content: data.answer,
                    citations: data.citations,
                  },
                ],
              }
            : chat,
        ),
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not reach the answer service.";
      setChats((current) =>
        current.map((chat) => (chat.id === chatId ? { ...chat, error: message } : chat)),
      );
    } finally {
      setChats((current) =>
        current.map((chat) => (chat.id === chatId ? { ...chat, pending: false } : chat)),
      );
    }
  }

  function elaborate(segment: TranscriptSegment) {
    void handleSend(
      `Elaborate on this part of the lecture: “${segment.text}”`,
      undefined,
      true,
      segment.start,
    );
  }

  function addToNotes(message: ChatMessage) {
    const chat = chats.find((item) => item.id === activeChatId);
    const index = chat?.messages.findIndex((item) => item.id === message.id) ?? -1;
    const question = index > 0 ? chat?.messages[index - 1]?.content : null;
    const heading =
      question
        ?.replace(/^Elaborate on this part of the lecture:\s*/i, "")
        .replace(/[“”"]/g, "")
        .slice(0, 80) || "Study note";

    setNotes((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        heading,
        body: message.content.replace(/\[\s*s\d+\s*]/g, "").trim(),
      },
    ]);
    setChats((current) =>
      current.map((item) => (item.id === activeChatId ? { ...item, error: null } : item)),
    );
    setSourceTab("notes");
  }

  const chatPanel = (
    <ChatPanel
      chats={chats}
      activeChatId={activeChatId}
      disabled={lecture === null}
      capturedFrame={capturedFrame}
      onChatSelect={setActiveChatId}
      onNewChat={addChat}
      onFrameRemove={() => setCapturedFrame(null)}
      onSend={handleSend}
      onCitationClick={handleCitationClick}
      onAddNote={addToNotes}
      onChatDelete={deleteChat}
    />
  );

  const sourcesPanel = (
    <SourcePanel
      key={lecture?.id ?? "empty"}
      lectureId={lecture?.id ?? null}
      lectureTitle={lecture?.title ?? "Lecture summary"}
      storedSummary={lecture?.summary ?? null}
      transcript={transcript}
      notes={notes}
      currentTime={currentTime}
      onSeek={seek}
      tab={sourceTab}
      onTabChange={setSourceTab}
      onElaborate={elaborate}
    />
  );

  return (
    <main
      ref={workspaceRef}
      style={{ "--workspace-left": `${panelSplit}%` } as CSSProperties}
      className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[clamp(20rem,var(--workspace-left),calc(100%_-_22.5rem))_.5rem_minmax(22rem,1fr)] lg:gap-0 lg:overflow-hidden"
    >
      <div className="flex min-h-0 flex-col gap-2 lg:gap-0 lg:overflow-hidden">
        <div
          ref={videoStackRef}
          style={{ "--workspace-video": `${videoSplit}%` } as CSSProperties}
          className="contents lg:grid lg:min-h-0 lg:flex-1 lg:grid-rows-[clamp(16rem,var(--workspace-video),calc(100%_-_12.5rem))_.5rem_minmax(12rem,1fr)]"
        >
          <LecturePlayer
            key={source ? `${source.kind}:${source.url}` : "empty"}
            title={lecture?.title ?? "No lecture loaded"}
            course={lecture?.uploader ?? "Choose New lecture or open one from the library"}
            source={source}
            seekRequest={seekRequest}
            onTimeChange={handleTimeChange}
            onCapture={setCapturedFrame}
          />

          <div
            role="separator"
            aria-label={`Resize video and ${layout === "chat-right" ? "sources" : "chat"} panels`}
            aria-orientation="horizontal"
            aria-valuenow={Math.round(videoSplit)}
            tabIndex={0}
            onKeyDown={handleVideoResizeKey}
            onPointerDown={handleVideoResizeStart}
            onPointerMove={(event) =>
              event.currentTarget.hasPointerCapture(event.pointerId) && resizeVideo(event.clientY)
            }
            onPointerUp={(event) =>
              event.currentTarget.hasPointerCapture(event.pointerId) &&
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
            onPointerCancel={(event) =>
              event.currentTarget.hasPointerCapture(event.pointerId) &&
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
            className="group relative z-10 hidden touch-none cursor-row-resize select-none lg:block"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-separator transition-colors group-hover:bg-accent-ink group-focus-visible:bg-accent-ink"
            />
          </div>

          <div className="min-h-72 flex-1 overflow-hidden lg:min-h-0">
            {layout === "chat-right" ? sourcesPanel : chatPanel}
          </div>
        </div>
      </div>

      <div
        role="separator"
        aria-label="Resize panels"
        aria-orientation="vertical"
        aria-valuenow={Math.round(panelSplit)}
        tabIndex={0}
        onKeyDown={handleResizeKey}
        onPointerDown={handleResizeStart}
        onPointerMove={(event) =>
          event.currentTarget.hasPointerCapture(event.pointerId) && resizePanels(event.clientX)
        }
        onPointerUp={(event) =>
          event.currentTarget.hasPointerCapture(event.pointerId) &&
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        onPointerCancel={(event) =>
          event.currentTarget.hasPointerCapture(event.pointerId) &&
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        className="group relative z-10 hidden touch-none cursor-col-resize select-none lg:block"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-separator transition-colors group-hover:bg-accent-ink group-focus-visible:bg-accent-ink"
        />
      </div>

      <div className="min-h-[28rem] overflow-hidden lg:min-h-0">
        {layout === "chat-right" ? chatPanel : sourcesPanel}
      </div>
    </main>
  );
}
