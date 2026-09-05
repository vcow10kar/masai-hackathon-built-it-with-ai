"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { LecturePlayer, type SeekRequest } from "@/components/LecturePlayer";
import { SourcePanel } from "@/components/SourcePanel";
import { VideoUrlBar } from "@/components/VideoUrlBar";
import { sampleLecture, sampleNotes, sampleTranscript } from "@/lib/sample-data";
import type { VideoSource } from "@/lib/video-source";
import type { ChatMessage, Citation } from "@/lib/types";

export default function Home() {
  const [source, setSource] = useState<VideoSource | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

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

  // Placeholder until the retrieval route exists: echoes a fixed citation so
  // the answer-and-jump path can be exercised end to end.
  function handleSend(question: string) {
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, role: "user", content: question },
      {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: "Answers will appear here once retrieval is wired up.",
        citations: [{ kind: "transcript", segmentId: "t3", start: 155 }],
      },
    ]);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex shrink-0 flex-col gap-3 border-b border-black/10 px-4 py-3 sm:flex-row sm:items-center dark:border-white/15">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight">Ask the Lecture</h1>
        <div className="min-w-0 flex-1 sm:max-w-xl">
          <VideoUrlBar onLoad={setSource} />
        </div>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-4">
          <LecturePlayer
            key={source ? `${source.kind}:${source.url}` : "empty"}
            title={sampleLecture.title}
            course={sampleLecture.course}
            source={source}
            seekRequest={seekRequest}
          />
          <div className="min-h-64 flex-1">
            <SourcePanel
              transcript={sampleTranscript}
              notes={sampleNotes}
              activeSegmentId={activeSegmentId}
              onSeek={seek}
            />
          </div>
        </div>

        <div className="min-h-96 lg:min-h-0">
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            onCitationClick={handleCitationClick}
          />
        </div>
      </main>
    </div>
  );
}
