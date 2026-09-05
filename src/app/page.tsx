import Link from "next/link";
import { LectureWorkspace, type WorkspaceLecture } from "@/components/LectureWorkspace";
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
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex shrink-0 items-baseline justify-between gap-4 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <h1 className="text-sm font-semibold tracking-tight">Ask the Lecture</h1>
        <Link
          href="/library"
          className="text-xs text-black/60 underline-offset-4 hover:underline dark:text-white/60"
        >
          Library
        </Link>
      </header>

      <LectureWorkspace lecture={workspaceLecture} />
    </div>
  );
}
