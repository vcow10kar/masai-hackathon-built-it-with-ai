import Link from "next/link";
import {
  LectureWorkspace,
  type WorkspaceLayout,
  type WorkspaceLecture,
} from "@/components/LectureWorkspace";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getLecture, getLectureWorkspace } from "@/lib/store";

type Props = {
  searchParams: Promise<{ lecture?: string; layout?: string }>;
};

export default async function Home({ searchParams }: Props) {
  const { lecture: lectureId, layout } = await searchParams;
  const workspaceLayout: WorkspaceLayout = layout === "chat-right" ? "chat-right" : "sources-right";
  const lecture = lectureId ? await getLecture(lectureId) : null;
  const workspace = lecture ? await getLectureWorkspace(lecture.id) : { chats: [], notes: [] };

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
          <nav className="mr-1 flex rounded-[10px] bg-sunken p-0.5" aria-label="Workspace layout">
            {(["sources-right", "chat-right"] as const).map((option) => (
              <Link
                key={option}
                href={{
                  pathname: "/",
                  query: { ...(lectureId ? { lecture: lectureId } : {}), layout: option },
                }}
                aria-label={option === "chat-right" ? "Chat on right" : "Sources on right"}
                aria-current={workspaceLayout === option ? "page" : undefined}
                title={option === "chat-right" ? "Chat on right" : "Transcript and notes on right"}
                className={`grid size-7 place-items-center rounded-lg transition-colors ${
                  workspaceLayout === option
                    ? "bg-segment text-accent-ink shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                  <rect x="1.5" y="2" width="8" height="7" rx="1.25" stroke="currentColor" />
                  <rect x="1.5" y="11" width="8" height="3" rx="1" stroke="currentColor" />
                  <rect x="11.5" y="2" width="3" height="12" rx="1" stroke="currentColor" />
                  {option === "chat-right" ? (
                    <path d="M12.4 6h1.2v3h-.7l-.5.6V6Z" fill="currentColor" />
                  ) : (
                    <path d="M12.2 6h1.6M12.2 8h1.6M12.2 10h1.6" stroke="currentColor" strokeWidth=".7" />
                  )}
                </svg>
              </Link>
            ))}
          </nav>
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
