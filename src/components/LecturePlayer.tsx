"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VideoControls } from "@/components/VideoControls";
import type { FrameAttachment } from "@/lib/types";
import type { VideoSource } from "@/lib/video-source";
import { loadYouTubeApi, YT_STATE, type YouTubePlayer } from "@/lib/youtube-api";

export type SeekRequest = { seconds: number; nonce: number };

type Props = {
  title: string;
  course: string;
  source: VideoSource | null;
  seekRequest: SeekRequest | null;
  onTimeChange: (seconds: number) => void;
  onCapture: (frame: FrameAttachment) => void;
};

const MAX_FRAME_WIDTH = 1280;

/** Compresses a video image so previews and multimodal requests stay small. */
function imageDataUrl(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop = { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
) {
  const width = Math.min(MAX_FRAME_WIDTH, Math.max(1, Math.round(crop.width)));
  const height = Math.max(1, Math.round((crop.height / crop.width) * width));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create an image from this frame.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    width,
    height,
  );
  return canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * YouTube lives in a cross-origin iframe, so the page cannot read its pixels.
 * Current-tab capture gets the exact paused frame without proxying the video.
 */
async function captureSharedTab(videoElement: HTMLElement) {
  const cropTarget = (window as Window & {
    CropTarget?: { fromElement: (element: HTMLElement) => Promise<unknown> };
  }).CropTarget;
  if (!navigator.mediaDevices?.getDisplayMedia || !cropTarget) {
    throw new Error("Tab capture needs desktop Chrome or Edge. Open this lecture there to capture a frame.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: { frameRate: { ideal: 5 }, displaySurface: "browser" },
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
  } as DisplayMediaStreamOptions);

  try {
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
      cropTo?: (target: unknown) => Promise<void>;
    };
    if (!track) throw new Error("No screen was shared.");

    const surface = track.getSettings().displaySurface;
    if (surface !== "browser") {
      throw new Error("Choose “This Tab” in the share dialog to capture the video frame.");
    }

    if (!track.cropTo) {
      throw new Error("This browser cannot isolate the video. Try desktop Chrome or Edge.");
    }
    try {
      // Cropping to an element in this document also rejects a different tab.
      // The browser tracks resizing and captures only this video rectangle.
      await track.cropTo(await cropTarget.fromElement(videoElement));
    } catch {
      throw new Error("Choose this lecture’s tab, then try capturing again.");
    }

    const captured = document.createElement("video");
    captured.muted = true;
    captured.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error("The shared tab did not produce a frame. Please try again.")), 10000);
      function finish(error?: unknown) {
        window.clearTimeout(timeout);
        captured.onloadeddata = null;
        captured.onerror = null;
        if (error) reject(error);
        else resolve();
      }
      captured.onloadeddata = () => finish();
      captured.onerror = () => finish(new Error("The shared tab could not be captured."));
      captured.srcObject = stream;
      void captured.play().catch(finish);
    });

    return imageDataUrl(captured, captured.videoWidth, captured.videoHeight);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export function LecturePlayer({
  title,
  course,
  source,
  seekRequest,
  onTimeChange,
  onCapture,
}: Props) {
  const shellRef = useRef<HTMLElement>(null);
  const videoBoundsRef = useRef<HTMLDivElement>(null);
  const youtubeHostRef = useRef<HTMLDivElement>(null);
  const youtubeRef = useRef<YouTubePlayer | null>(null);
  const fileRef = useRef<HTMLVideoElement>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Held in a ref so the polling effect does not restart when the parent
  // re-renders with a new callback identity.
  const reportTime = useRef(onTimeChange);

  useEffect(() => {
    reportTime.current = onTimeChange;
  }, [onTimeChange]);

  const youtubeId = source?.kind === "youtube" ? source.videoId : null;

  const publishTime = useCallback((seconds: number) => {
    setCurrentTime(seconds);
    reportTime.current(seconds);
  }, []);

  // Build the YouTube player for the current video and poll its position,
  // since the IFrame API reports time only on request. `controls: 0` hands the
  // whole surface over to our own control bar.
  useEffect(() => {
    if (!youtubeId) return;

    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | undefined;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !youtubeHostRef.current) return;

      youtubeRef.current = new YT.Player(youtubeHostRef.current, {
        videoId: youtubeId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          fs: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            setReady(true);
            setDuration(youtubeRef.current?.getDuration() ?? 0);
            // A quarter second keeps the highlighted transcript line in step
            // with what is being said without busy-looping.
            poll = setInterval(() => {
              const player = youtubeRef.current;
              if (!player) return;
              publishTime(player.getCurrentTime());
              setDuration(player.getDuration());
            }, 250);
          },
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === YT_STATE.PLAYING) setPlaying(true);
            if (event.data === YT_STATE.PAUSED || event.data === YT_STATE.ENDED) {
              setPlaying(false);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      youtubeRef.current?.destroy();
      youtubeRef.current = null;
      setReady(false);
      setPlaying(false);
    };
  }, [youtubeId, publishTime]);

  const seekTo = useCallback(
    (seconds: number) => {
      const limit = duration > 0 ? duration : seconds;
      const target = Math.min(Math.max(seconds, 0), limit);

      if (youtubeRef.current) {
        youtubeRef.current.seekTo(target, true);
      } else if (fileRef.current) {
        fileRef.current.currentTime = target;
      } else {
        return;
      }
      publishTime(target);
    },
    [duration, publishTime],
  );

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

  useEffect(() => {
    function sync() {
      setFullscreen(document.fullscreenElement === shellRef.current);
    }
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  function togglePlay() {
    const youtube = youtubeRef.current;
    if (youtube) {
      if (playing) youtube.pauseVideo();
      else youtube.playVideo();
      return;
    }

    const file = fileRef.current;
    if (!file) return;
    if (file.paused) void file.play().catch(() => {});
    else file.pause();
  }

  function changeVolume(next: number) {
    const level = Math.min(Math.max(next, 0), 1);
    setVolume(level);
    setMuted(level === 0);

    const youtube = youtubeRef.current;
    if (youtube) {
      youtube.setVolume(level * 100);
      if (level === 0) youtube.mute();
      else youtube.unMute();
    }
    if (fileRef.current) {
      fileRef.current.volume = level;
      fileRef.current.muted = level === 0;
    }
  }

  function toggleMute() {
    // Unmuting from a zero slider restores an audible level, the way the
    // native controls do.
    const next = !(muted || volume === 0);
    if (!next && volume === 0) {
      changeVolume(0.5);
      return;
    }

    setMuted(next);
    if (youtubeRef.current) {
      if (next) youtubeRef.current.mute();
      else youtubeRef.current.unMute();
    }
    if (fileRef.current) fileRef.current.muted = next;
  }

  function changeRate(next: number) {
    setRate(next);
    youtubeRef.current?.setPlaybackRate(next);
    if (fileRef.current) fileRef.current.playbackRate = next;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void shellRef.current?.requestFullscreen().catch(() => {});
    }
  }

  async function captureFrame() {
    if (!source || playing || capturing || !videoBoundsRef.current) return;
    const timestamp = youtubeRef.current?.getCurrentTime() ?? fileRef.current?.currentTime ?? currentTime;

    setCapturing(true);
    setCaptureError(null);
    try {
      let dataUrl: string;
      const file = fileRef.current;

      if (
        source.kind === "file" &&
        file &&
        file.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        file.videoWidth > 0
      ) {
        try {
          dataUrl = imageDataUrl(file, file.videoWidth, file.videoHeight);
        } catch {
          // Cross-origin files without CORS headers taint canvas; sharing the
          // current tab is the compatible fallback.
          dataUrl = await captureSharedTab(videoBoundsRef.current);
        }
      } else {
        dataUrl = await captureSharedTab(videoBoundsRef.current);
      }

      onCapture({ dataUrl, timestamp });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Capture was cancelled. Choose “This Tab” to capture a YouTube frame."
          : error instanceof Error
            ? error.message
            : "The paused frame could not be captured.";
      setCaptureError(message);
    } finally {
      setCapturing(false);
    }
  }

  // The native shortcuts went away with the native controls, so the shell
  // carries them for whichever source is loaded.
  function handleKeyDown(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) return;

    const actions: Record<string, () => void> = {
      " ": togglePlay,
      k: togglePlay,
      ArrowLeft: () => seekTo(currentTime - 5),
      ArrowRight: () => seekTo(currentTime + 5),
      j: () => seekTo(currentTime - 10),
      l: () => seekTo(currentTime + 10),
      m: toggleMute,
      f: toggleFullscreen,
    };

    const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  return (
    <section
      ref={shellRef}
      onKeyDown={handleKeyDown}
      className={`flex flex-col gap-3 bg-surface p-3 ${
        fullscreen ? "justify-center" : "panel rounded-2xl lg:max-h-[65%] lg:shrink-0"
      }`}
    >
      <div
        ref={videoBoundsRef}
        className={`relative min-h-0 overflow-hidden bg-black ${
          fullscreen ? "min-h-0 flex-1" : "aspect-video rounded-xl"
        }`}
      >
        {source?.kind === "youtube" ? (
          <>
            <div key={source.videoId} className="size-full">
              <div ref={youtubeHostRef} className="size-full" />
            </div>
            {/* Covers the iframe so YouTube's own click targets and hover
                chrome never surface; clicks become a play/pause instead. */}
            <button
              type="button"
              onClick={togglePlay}
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 size-full cursor-pointer"
            />
          </>
        ) : source?.kind === "file" ? (
          <video
            key={source.url}
            ref={fileRef}
            src={source.url}
            playsInline
            onClick={togglePlay}
            onTimeUpdate={(event) => publishTime(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => {
              setDuration(event.currentTarget.duration);
              event.currentTarget.volume = volume;
              event.currentTarget.muted = muted;
              event.currentTarget.playbackRate = rate;
            }}
            onLoadedData={() => setReady(true)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onVolumeChange={(event) => {
              setVolume(event.currentTarget.volume);
              setMuted(event.currentTarget.muted);
            }}
            className="size-full cursor-pointer"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-sunken px-6 text-center text-[13px] text-subtle">
            Paste a lecture URL above to load the recording.
          </div>
        )}
      </div>

      {!fullscreen && (
        <div className="flex min-w-0 items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <h2 className="display truncate text-[19px] leading-snug">{title}</h2>
            <p className="truncate text-[13px] text-subtle">{course}</p>
          </div>
          {ready && !playing && source && (
            <button
              type="button"
              onClick={captureFrame}
              disabled={capturing}
              title={source.kind === "youtube" ? "Choose this lecture tab when your browser asks what to share" : "Capture the paused video image"}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-separator px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:border-transparent hover:bg-fill hover:text-foreground disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
                <path
                  d="M5.25 3.5 6.1 2h3.8l.85 1.5H13A1.5 1.5 0 0 1 14.5 5v7a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12V5A1.5 1.5 0 0 1 3 3.5h2.25Z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinejoin="round"
                />
                <circle cx="8" cy="8.5" r="2.25" stroke="currentColor" strokeWidth="1.25" />
              </svg>
              {capturing ? "Capturing…" : "Capture frame"}
            </button>
          )}
        </div>
      )}

      {!fullscreen && captureError && (
        <p className="px-1 text-[12px] leading-snug text-danger">{captureError}</p>
      )}

      <VideoControls
        ready={ready}
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        muted={muted}
        rate={rate}
        fullscreen={fullscreen}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onSkip={(delta) => seekTo(currentTime + delta)}
        onVolumeChange={changeVolume}
        onToggleMute={toggleMute}
        onRateChange={changeRate}
        onToggleFullscreen={toggleFullscreen}
      />
    </section>
  );
}
