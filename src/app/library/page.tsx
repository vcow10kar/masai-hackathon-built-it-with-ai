import Link from "next/link";
import { formatTimestamp } from "@/lib/format";
import { listLectures } from "@/lib/store";

export const metadata = { title: "Library — Ask the Lecture" };

// Transcripts are read from disk on each request, so a freshly ingested
// lecture shows up without a rebuild.
export const dynamic = "force-dynamic";

function coverage(covered: number, total: number) {
  if (total <= 0) return null;
  return Math.min(100, Math.round((covered / total) * 100));
}

export default async function LibraryPage() {
  const lectures = (await listLectures()).map((lecture) => ({
    ...lecture,
    segmentCount: lecture.segments.length,
    coveredSeconds: lecture.segments[lecture.segments.length - 1]?.end ?? 0,
  }));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <h1 className="text-sm font-semibold tracking-tight">Library</h1>
        <Link href="/" className="text-xs text-black/60 underline-offset-4 hover:underline dark:text-white/60">
          Back to lecture
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-4">
        {lectures.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/15 p-8 text-center dark:border-white/20">
            <p className="text-sm font-medium">No lectures ingested yet</p>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">
              Add one from the command line:
            </p>
            <code className="mt-3 inline-block rounded bg-black/[.06] px-3 py-1.5 font-mono text-xs dark:bg-white/[.10]">
              npm run ingest -- &lt;video url&gt;
            </code>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {lectures.map((lecture) => {
              const percent = coverage(lecture.coveredSeconds, lecture.durationSeconds);

              return (
                <li
                  key={lecture.id}
                  className="rounded-lg border border-black/10 p-4 dark:border-white/15"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium">{lecture.title}</h2>
                      <p className="truncate text-xs text-black/50 dark:text-white/50">
                        {lecture.uploader} · {formatTimestamp(lecture.durationSeconds)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-black/15 px-2 py-0.5 text-xs dark:border-white/20">
                      {lecture.source === "captions" ? "Captions" : "Whisper"}
                    </span>
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-black/60 dark:text-white/60">
                    <div className="flex gap-1.5">
                      <dt>Segments</dt>
                      <dd className="font-mono tabular-nums text-foreground">{lecture.segmentCount}</dd>
                    </div>
                    {percent !== null && (
                      <div className="flex gap-1.5">
                        <dt>Coverage</dt>
                        <dd className="font-mono tabular-nums text-foreground">{percent}%</dd>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <dt>Ingested</dt>
                      <dd className="font-mono tabular-nums text-foreground">
                        {lecture.ingestedAt.slice(0, 10)}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex gap-3 text-xs">
                    <Link
                      href={`/?lecture=${lecture.id}`}
                      className="rounded bg-foreground px-3 py-1.5 font-medium text-background transition-opacity hover:opacity-90"
                    >
                      Open
                    </Link>
                    <a
                      href={lecture.url}
                      target="_blank"
                      rel="noreferrer"
                      className="self-center text-black/60 underline-offset-4 hover:underline dark:text-white/60"
                    >
                      Source video
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
