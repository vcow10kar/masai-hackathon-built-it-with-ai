"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { LecturePlayer, type SeekRequest } from "@/components/LecturePlayer";
import { SourcePanel } from "@/components/SourcePanel";
import { VideoUrlBar } from "@/components/VideoUrlBar";
import { sampleNotes } from "@/lib/sample-data";
import { parseVideoSource, type VideoSource } from "@/lib/video-source";
import type { ChatMessage, Citation, TranscriptSegment } from "@/lib/types";

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
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  const transcript = lecture?.segments ?? [];

  // The nonce makes repeat seeks to the same second distinct, so clicking the
  // same citation twice still moves the player.
  function seek(seconds: number, segmentId: string) {
    setSeekRequest({ seconds, nonce: Date.now() });
    setActiveSegmentId(segmentId);
  }

  function handleCitationClick(citation: Citation) {
    if (citation.kind === "transcript") {
      seek(citation.start, citation.segmentId);
    }
  }

  async function handleSend(question: string) {
    if (!lecture) return;

    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, role: "user", content: question },
    ]);
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lectureId: lecture.id, question }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Request failed.");

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
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
    <main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-4">
        <VideoUrlBar />

        <LecturePlayer
          key={source ? `${source.kind}:${source.url}` : "empty"}
          title={lecture?.title ?? "No lecture loaded"}
          course={lecture?.uploader ?? "Paste a URL or open one from the library"}
          source={source}
          seekRequest={seekRequest}
        />

        <div className="min-h-64 flex-1">
          <SourcePanel
            transcript={transcript}
            notes={sampleNotes}
            activeSegmentId={activeSegmentId}
            onSeek={seek}
          />
        </div>
      </div>

      <div className="min-h-96 lg:min-h-0">
        <ChatPanel
          messages={messages}
          pending={pending}
          disabled={lecture === null}
          error={error}
          onSend={handleSend}
          onCitationClick={handleCitationClick}
        />
      </div>
    </main>
  );
}
