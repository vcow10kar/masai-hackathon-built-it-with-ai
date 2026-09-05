import Link from "next/link";
import {
  LectureWorkspace,
  type WorkspaceLayout,
  type WorkspaceLecture,
} from "@/components/LectureWorkspace";
import { LibraryDialog } from "@/components/LibraryDialog";
import { LayoutPicker } from "@/components/LayoutPicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VideoUrlBar } from "@/components/VideoUrlBar";
import { formatTimestamp } from "@/lib/format";
import { getLecture, getLectureWorkspace, listLectures } from "@/lib/store";

type Props = {
  searchParams: Promise<{ lecture?: string; layout?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const { lecture: lectureId, layout } = await searchParams;
  const workspaceLayout: WorkspaceLayout = layout === "sources-right" ? "sources-right" : "chat-right";
  const [lecture, lectures, workspace] = await Promise.all([
    lectureId ? getLecture(lectureId) : null,
    listLectures(),
    lectureId ? getLectureWorkspace(lectureId) : { chats: [], notes: [] },
  ]);

  const workspaceLecture: WorkspaceLecture | null = lecture
    ? {
        id: lecture.id,
        title: lecture.title,
        uploader: lecture.uploader,
        url: lecture.url,
        segments: lecture.segments,
        summary: lecture.summary ?? null,
        quiz: lecture.quiz ?? null,
      }
    : null;

  return (
    <div className="flex min-h-full flex-1 flex-col lg:h-dvh lg:min-h-0 lg:flex-none lg:overflow-hidden">
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-separator bg-chrome px-3 py-2 backdrop-blur-xl backdrop-saturate-150">
        <h1 className="display hidden shrink-0 text-[18px] leading-none lg:block">Ask the Lecture</h1>
        <VideoUrlBar
          key={lecture?.id ?? "empty"}
          lectures={lectures.map(({ id, title }) => ({ id, title }))}
          activeLectureId={lecture?.id}
          layout={workspaceLayout}
        />
        <div className="flex shrink-0 items-center gap-1">
          <LayoutPicker lectureId={lectureId} layout={workspaceLayout} />
          <LibraryDialog />
          <ThemeToggle />
        </div>
      </header>

      {workspaceLecture ? (
        <LectureWorkspace
          lecture={workspaceLecture}
          initialWorkspace={workspace}
          layout={workspaceLayout}
        />
      ) : (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-5">
          <section className="panel rounded-2xl p-5">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h2 className="display text-[24px] leading-tight">Your library</h2>
                <p className="mt-1 text-[13px] text-muted">Open a lecture to start watching and asking questions.</p>
              </div>
              <span className="shrink-0 text-[12px] text-subtle">{lectures.length} {lectures.length === 1 ? "lecture" : "lectures"}</span>
            </div>

            {lectures.length > 0 ? (
              <ul className="mt-5 divide-y divide-separator">
                {lectures.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{item.title}</p>
                      <p className="mt-0.5 truncate text-[12px] text-subtle">
                        {item.uploader} · {formatTimestamp(item.durationSeconds)}
                      </p>
                    </div>
                    <Link
                      href={`/?lecture=${item.id}&layout=${workspaceLayout}`}
                      className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-hover"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 rounded-xl bg-sunken px-4 py-5 text-[13px] text-muted">
                Your saved lectures will appear here.
              </p>
            )}
          </section>

          <p className="text-center text-[13px] text-subtle">
            Ready to study? Choose <span className="font-medium text-accent-ink">Add video link</span> above.
          </p>
        </main>
      )}
    </div>
  );
}
