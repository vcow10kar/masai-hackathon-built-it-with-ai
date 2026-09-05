import Link from "next/link";
import { DeleteLectureButton } from "@/components/DeleteLectureButton";
import { ThemeToggle } from "@/components/ThemeToggle";
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
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-4 border-b border-separator bg-chrome px-5 py-2.5 backdrop-blur-xl backdrop-saturate-150">
        <h1 className="display text-[20px] leading-none">Library</h1>
        <div className="flex items-center gap-1">
          <Link
            href="/"
            className="rounded-full px-3 py-1 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-wash"
          >
            Back to lecture
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-5">
        {lectures.length === 0 ? (
          <div className="panel rounded-2xl p-12 text-center">
            <p className="display text-[24px] leading-tight">Nothing ingested yet</p>
            <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted">
              Choose New lecture in the workspace and it lands here once transcribed, ready to
              open and question.
            </p>
            <code className="mt-5 inline-block rounded-lg bg-sunken px-3 py-1.5 font-mono text-[12px] text-accent-ink">
              npm run ingest -- &lt;video url&gt;
            </code>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {lectures.map((lecture) => {
              const percent = coverage(lecture.coveredSeconds, lecture.durationSeconds);

              return (
                <li
                  key={lecture.id}
                  className="panel panel-hover rounded-2xl p-5 transition-shadow duration-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="display truncate text-[19px] leading-snug">{lecture.title}</h2>
                      <p className="mt-0.5 truncate text-[13px] text-subtle">
                        {lecture.uploader} ·{" "}
                        <span className="font-mono tabular-nums">
                          {formatTimestamp(lecture.durationSeconds)}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-edge px-2.5 py-0.5 text-[12px] text-muted">
                      {lecture.source === "captions" ? "Captions" : "Whisper"}
                    </span>
                  </div>

                  <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted">
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

                  <div className="mt-4 flex items-center gap-4 text-[13px]">
                    <Link
                      href={`/?lecture=${lecture.id}`}
                      className="rounded-full bg-accent px-4 py-1.5 font-medium text-on-accent transition-colors hover:bg-accent-hover"
                    >
                      Open
                    </Link>
                    <a
                      href={lecture.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Source video
                    </a>
                    <DeleteLectureButton lectureId={lecture.id} title={lecture.title} />
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
