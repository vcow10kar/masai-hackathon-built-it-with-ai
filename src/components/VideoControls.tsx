"use client";

import { useState } from "react";
import { formatTimestamp } from "@/lib/format";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type Props = {
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  /** 0 to 1. */
  volume: number;
  muted: boolean;
  rate: number;
  fullscreen: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onSkip: (delta: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
};

export function VideoControls({
  ready,
  playing,
  currentTime,
  duration,
  volume,
  muted,
  rate,
  fullscreen,
  onTogglePlay,
  onSeek,
  onSkip,
  onVolumeChange,
  onToggleMute,
  onRateChange,
  onToggleFullscreen,
}: Props) {
  // While the scrubber is dragged the thumb follows the pointer and the player
  // is left alone; the seek lands once the drag ends.
  const [scrub, setScrub] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const position = scrub ?? currentTime;
  const max = duration > 0 ? duration : 0;
  const progress = max > 0 ? (position / max) * 100 : 0;
  const level = muted ? 0 : volume;

  function commitScrub() {
    setDragging(false);
    if (scrub === null) return;
    onSeek(scrub);
    setScrub(null);
  }

  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      <input
        type="range"
        min={0}
        max={max || 1}
        step={0.1}
        value={position}
        disabled={!ready || max === 0}
        aria-label="Seek"
        aria-valuetext={`${formatTimestamp(position)} of ${formatTimestamp(max)}`}
        onPointerDown={() => setDragging(true)}
        onPointerUp={commitScrub}
        onPointerCancel={commitScrub}
        onBlur={commitScrub}
        onChange={(event) => {
          const next = Number(event.target.value);
          // Keyboard changes arrive without a drag, so they seek right away.
          if (dragging) setScrub(next);
          else onSeek(next);
        }}
        className="player-range h-4 w-full"
        style={{ "--progress": `${progress}%` } as React.CSSProperties}
      />

      <div className="flex items-center gap-1">
        <ControlButton
          label={playing ? "Pause" : "Play"}
          disabled={!ready}
          onClick={onTogglePlay}
        >
          {playing ? (
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-[18px]">
              <path d="M6.25 3.5h2.5v13h-2.5zM11.25 3.5h2.5v13h-2.5z" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-[18px]">
              <path d="M6.5 3.9v12.2a.6.6 0 0 0 .92.5l9.2-6.1a.6.6 0 0 0 0-1l-9.2-6.1a.6.6 0 0 0-.92.5Z" />
            </svg>
          )}
        </ControlButton>

        <ControlButton label="Back 10 seconds" disabled={!ready} onClick={() => onSkip(-10)}>
          <SkipIcon direction="back" />
        </ControlButton>

        <ControlButton label="Forward 10 seconds" disabled={!ready} onClick={() => onSkip(10)}>
          <SkipIcon direction="forward" />
        </ControlButton>

        <div className="group flex items-center">
          <ControlButton
            label={muted || volume === 0 ? "Unmute" : "Mute"}
            disabled={!ready}
            onClick={onToggleMute}
          >
            <VolumeIcon level={level} />
          </ControlButton>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={level}
            disabled={!ready}
            aria-label="Volume"
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            className="player-range hidden h-4 w-16 sm:block"
            style={{ "--progress": `${level * 100}%` } as React.CSSProperties}
          />
        </div>

        <p className="ml-1 shrink-0 font-mono text-[12px] tabular-nums text-subtle">
          <span className="font-medium text-accent-ink">{formatTimestamp(position)}</span> /{" "}
          {formatTimestamp(duration)}
        </p>

        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="playback-rate">
            Playback speed
          </label>
          <select
            id="playback-rate"
            value={rate}
            disabled={!ready}
            onChange={(event) => onRateChange(Number(event.target.value))}
            className="cursor-pointer rounded-full border border-separator px-2 py-1 font-mono text-[12px] tabular-nums text-muted outline-none transition-colors hover:border-transparent hover:bg-fill hover:text-foreground disabled:cursor-default disabled:text-subtle disabled:opacity-50"
          >
            {RATES.map((option) => (
              <option key={option} value={option}>
                {option}×
              </option>
            ))}
          </select>

          <ControlButton
            label={fullscreen ? "Exit full screen" : "Full screen"}
            disabled={!ready}
            onClick={onToggleFullscreen}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-[18px]"
            >
              {fullscreen ? (
                <path d="M8 3.5V8H3.5M12 3.5V8h4.5M8 16.5V12H3.5M12 16.5V12h4.5" />
              ) : (
                <path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4" />
              )}
            </svg>
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-foreground disabled:text-subtle disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function SkipIcon({ direction }: { direction: "back" | "forward" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`size-[18px] ${direction === "back" ? "" : "-scale-x-100"}`}
    >
      <path d="M9.4 4.2H11a5 5 0 1 1-5 5" />
      <path d="M11.4 2 9.2 4.2l2.2 2.2" />
    </svg>
  );
}

function VolumeIcon({ level }: { level: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path d="M4 7.5h2.5L10 4.5v11L6.5 12.5H4Z" />
      {level === 0 ? (
        <path d="M13 8l3.5 4M16.5 8 13 12" />
      ) : (
        <>
          <path d="M12.6 7.6a3.4 3.4 0 0 1 0 4.8" />
          {level > 0.5 && <path d="M14.9 5.6a6.4 6.4 0 0 1 0 8.8" />}
        </>
      )}
    </svg>
  );
}
