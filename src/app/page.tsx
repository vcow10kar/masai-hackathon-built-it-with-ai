import Link from "next/link";
import { LectureWorkspace, type WorkspaceLecture } from "@/components/LectureWorkspace";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getLecture } from "@/lib/store";

type Props = {
  searchParams: Promise<{ lecture?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const { lecture: lectureId } = await searchParams;
  const lecture = lectureId ? await getLecture(lectureId) : null;

  const workspaceLecture: WorkspaceLecture | null = lecture
    ? {
        id: lecture.id,
        title: lecture.title,
        uploader: lecture.uploader,
        url: lecture.url,
        segments: lecture.segments,
      }
    : null;

  return (
    <div className="flex min-h-full flex-1 flex-col lg:h-dvh lg:min-h-0 lg:flex-none lg:overflow-hidden">
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-4 border-b border-separator bg-chrome px-5 py-2.5 backdrop-blur-xl backdrop-saturate-150">
        <h1 className="display text-[20px] leading-none">Ask the Lecture</h1>
        <div className="flex items-center gap-1">
          <Link
            href="/library"
            className="rounded-full px-3 py-1 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-wash"
          >
            Library
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <LectureWorkspace lecture={workspaceLecture} />
    </div>
  );
}
