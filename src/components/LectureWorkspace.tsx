"use client";

import { useRef, useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { LecturePlayer, type SeekRequest } from "@/components/LecturePlayer";
import { SourcePanel } from "@/components/SourcePanel";
import { VideoUrlBar } from "@/components/VideoUrlBar";
import { sampleNotes } from "@/lib/sample-data";
import { activeSegmentIndex } from "@/lib/segments";
import { parseVideoSource, type VideoSource } from "@/lib/video-source";
import type {
  ChatMessage,
  Citation,
  FrameAttachment,
  TranscriptSegment,
} from "@/lib/types";

export type WorkspaceLecture = {
  id: string;
  title: string;
  uploader: string;
  url: string;
  segments: TranscriptSegment[];
};

type Props = {
  lecture: WorkspaceLecture | null;
};

export function LectureWorkspace({ lecture }: Props) {
  const source: VideoSource | null = lecture ? parseVideoSource(lecture.url) : null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [capturedFrame, setCapturedFrame] = useState<FrameAttachment | null>(null);

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

  async function handleSend(question: string, frame?: FrameAttachment) {
    if (!lecture) return;

    const askedAt = Date.now();
    const history = messages.map(({ role, content }) => ({ role, content }));

    setMessages((current) => [
      ...current,
      { id: `${askedAt}-user`, role: "user", content: question, frame },
    ]);
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lectureId: lecture.id, question, history, frame }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");

      setMessages((current) => [
        ...current,
        {
          id: `${askedAt}-assistant`,
          role: "assistant",
          content: data.answer,
          citations: data.citations,
        },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the answer service.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-0 flex-1 gap-5 p-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(22rem,1fr)] lg:overflow-hidden">
      <div className="flex min-h-0 flex-col gap-5 lg:overflow-hidden">
        <VideoUrlBar />

        <LecturePlayer
          key={source ? `${source.kind}:${source.url}` : "empty"}
          title={lecture?.title ?? "No lecture loaded"}
          course={lecture?.uploader ?? "Paste a URL or open one from the library"}
          source={source}
          seekRequest={seekRequest}
          onTimeChange={handleTimeChange}
          onCapture={setCapturedFrame}
        />

        <div className="min-h-72 flex-1 overflow-hidden lg:min-h-0">
          <ChatPanel
            messages={messages}
            pending={pending}
            disabled={lecture === null}
            error={error}
            capturedFrame={capturedFrame}
            onFrameRemove={() => setCapturedFrame(null)}
            onSend={handleSend}
            onCitationClick={handleCitationClick}
          />
        </div>
      </div>

      <div className="min-h-[28rem] overflow-hidden lg:min-h-0">
        <SourcePanel
          transcript={transcript}
          notes={sampleNotes}
          currentTime={currentTime}
          onSeek={seek}
        />
      </div>
    </main>
  );
}
