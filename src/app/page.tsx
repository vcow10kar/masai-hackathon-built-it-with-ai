"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/ChatPanel";
import { LecturePlayer } from "@/components/LecturePlayer";
import { SourcePanel } from "@/components/SourcePanel";
import { sampleLecture, sampleNotes, sampleTranscript } from "@/lib/sample-data";
import type { ChatMessage, Citation } from "@/lib/types";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  function seek(seconds: number, segmentId: string) {
    setCurrentTime(seconds);
    setActiveSegmentId(segmentId);
  }

  function handleCitationClick(citation: Citation) {
    if (citation.kind === "transcript") {
      seek(citation.start, citation.segmentId);
    }
  }

  // Placeholder until the retrieval route exists: echoes the question back with
  // a fixed citation so the answer-and-jump flow can be exercised end to end.
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
      <header className="shrink-0 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <h1 className="text-sm font-semibold tracking-tight">Ask the Lecture</h1>
      </header>

      <main className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-4">
          <LecturePlayer
            title={sampleLecture.title}
            course={sampleLecture.course}
            currentTime={currentTime}
            durationSeconds={sampleLecture.durationSeconds}
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
