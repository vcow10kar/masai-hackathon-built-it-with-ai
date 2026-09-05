"use client";

import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import type { VideoSource } from "@/lib/video-source";
import { loadYouTubeApi, type YouTubePlayer } from "@/lib/youtube-api";

export type SeekRequest = { seconds: number; nonce: number };

type Props = {
  title: string;
  course: string;
  source: VideoSource | null;
  seekRequest: SeekRequest | null;
};

export function LecturePlayer({ title, course, source, seekRequest }: Props) {
  const youtubeHostRef = useRef<HTMLDivElement>(null);
  const youtubeRef = useRef<YouTubePlayer | null>(null);
  const fileRef = useRef<HTMLVideoElement>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const youtubeId = source?.kind === "youtube" ? source.videoId : null;

  // Build the YouTube player for the current video and poll its position,
  // since the IFrame API reports time only on request.
  useEffect(() => {
    if (!youtubeId) return;

    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !youtubeHostRef.current) return;

      youtubeRef.current = new YT.Player(youtubeHostRef.current, {
        videoId: youtubeId,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            if (cancelled) return;
            setDuration(youtubeRef.current?.getDuration() ?? 0);
            poll = setInterval(() => {
              const player = youtubeRef.current;
              if (!player) return;
              setCurrentTime(player.getCurrentTime());
              setDuration(player.getDuration());
            }, 500);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      youtubeRef.current?.destroy();
      youtubeRef.current = null;
    };
  }, [youtubeId]);

  // Apply seeks coming from transcript rows and answer citations.
  useEffect(() => {
    if (!seekRequest) return;

    if (youtubeRef.current) {
      youtubeRef.current.seekTo(seekRequest.seconds, true);
      youtubeRef.current.playVideo();
      setCurrentTime(seekRequest.seconds);
    } else if (fileRef.current) {
      fileRef.current.currentTime = seekRequest.seconds;
      void fileRef.current.play().catch(() => {});
    }
  }, [seekRequest]);

  return (
    <section className="flex flex-col gap-3">
      <div className="aspect-video overflow-hidden rounded-lg border border-black/10 bg-black/[.04] dark:border-white/15 dark:bg-white/[.04]">
        {source?.kind === "youtube" ? (
          <div key={source.videoId} className="size-full">
            <div ref={youtubeHostRef} className="size-full" />
          </div>
        ) : source?.kind === "file" ? (
          <video
            key={source.url}
            ref={fileRef}
            src={source.url}
            controls
            playsInline
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            className="size-full"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-6 text-center text-sm text-black/50 dark:text-white/50">
            Paste a lecture URL above to load the recording.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{title}</h2>
            <p className="truncate text-xs text-black/50 dark:text-white/50">{course}</p>
          </div>
          <p className="shrink-0 font-mono text-xs tabular-nums text-black/50 dark:text-white/50">
            {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
          </p>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
          role="progressbar"
          aria-label="Lecture position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
        >
          <div
            className="h-full rounded-full bg-foreground/70 transition-[width] duration-300"
            style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
          />
        </div>
      </div>
    </section>
  );
}
