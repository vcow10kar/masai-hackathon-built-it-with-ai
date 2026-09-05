import { formatTimestamp } from "@/lib/format";

type Props = {
  title: string;
  course: string;
  currentTime: number;
  durationSeconds: number;
};

export function LecturePlayer({ title, course, currentTime, durationSeconds }: Props) {
  const progress = durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex aspect-video items-center justify-center rounded-lg border border-black/10 bg-black/[.04] text-sm text-black/50 dark:border-white/15 dark:bg-white/[.04] dark:text-white/50">
        Video player goes here
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium">{title}</h2>
            <p className="truncate text-xs text-black/50 dark:text-white/50">{course}</p>
          </div>
          <p className="shrink-0 font-mono text-xs tabular-nums text-black/50 dark:text-white/50">
            {formatTimestamp(currentTime)} / {formatTimestamp(durationSeconds)}
          </p>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
          role="progressbar"
          aria-label="Lecture position"
          aria-valuemin={0}
          aria-valuemax={durationSeconds}
          aria-valuenow={currentTime}
        >
          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}
