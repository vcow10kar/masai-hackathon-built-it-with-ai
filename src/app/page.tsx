import Link from "next/link";
import {
  LectureWorkspace,
  type WorkspaceLayout,
  type WorkspaceLecture,
} from "@/components/LectureWorkspace";
import { LayoutPicker } from "@/components/LayoutPicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VideoUrlBar } from "@/components/VideoUrlBar";
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
          <Link
            href="/library"
            className="rounded-full px-3 py-1 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-wash"
          >
            Library
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <LectureWorkspace
        lecture={workspaceLecture}
        initialWorkspace={workspace}
        layout={workspaceLayout}
      />
    </div>
  );
}
