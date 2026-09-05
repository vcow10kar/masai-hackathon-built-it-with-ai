"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceLayout } from "@/components/LectureWorkspace";

type Props = {
  lectureId?: string;
  layout: WorkspaceLayout;
};

const options: { value: WorkspaceLayout; label: string; description: string }[] = [
  {
    value: "sources-right",
    label: "Sources on right",
    description: "Chat sits below the video",
  },
  {
    value: "chat-right",
    label: "Chat on right",
    description: "Sources sit below the video",
  },
];

function Preview({ layout }: { layout: WorkspaceLayout }) {
  const chatRight = layout === "chat-right";

  return (
    <div
      className="grid h-20 grid-cols-[1.65fr_0.75fr] gap-1 rounded-xl bg-sunken p-2"
      aria-hidden="true"
    >
      <div className="grid grid-rows-[1.5fr_0.75fr] gap-1">
        <span className="rounded bg-segment" />
        <span className="flex items-center gap-1 rounded bg-fill px-1.5">
          <span className="h-1 w-3 rounded-full bg-muted/60" />
          <span className="h-1 flex-1 rounded-full bg-muted/30" />
        </span>
      </div>
      <span className="flex flex-col gap-1 rounded bg-fill p-1.5">
        {chatRight ? (
          <>
            <span className="h-2 w-3/4 self-end rounded bg-segment" />
            <span className="h-1 w-full rounded-full bg-muted/40" />
            <span className="h-1 w-4/5 rounded-full bg-muted/25" />
          </>
        ) : (
          <>
            <span className="h-1 w-full rounded-full bg-muted/40" />
            <span className="h-1 w-3/4 rounded-full bg-muted/25" />
            <span className="h-1 w-5/6 rounded-full bg-muted/25" />
          </>
        )}
      </span>
    </div>
  );
}

export function LayoutPicker({ lectureId, layout }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Choose workspace layout"
        aria-expanded={open}
        aria-controls="layout-picker"
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 items-center gap-2 rounded-full px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-fill hover:text-foreground"
      >
        <svg viewBox="0 0 18 18" className="size-[18px]" fill="none" aria-hidden="true">
          <rect x="1.5" y="2" width="10" height="9" rx="1.5" stroke="currentColor" />
          <rect x="1.5" y="13" width="10" height="3.5" rx="1" stroke="currentColor" />
          <rect x="13.5" y="2" width="3" height="14.5" rx="1" stroke="currentColor" />
        </svg>
        <span className="hidden sm:inline">Layout</span>
        <svg
          viewBox="0 0 12 12"
          className={`hidden size-3 transition-transform sm:block ${open ? "rotate-180" : ""}`}
          fill="none"
          aria-hidden="true"
        >
          <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <section
          id="layout-picker"
          role="dialog"
          aria-label="Choose workspace layout"
          className="panel-raised fixed right-4 top-14 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-edge bg-surface p-3 sm:absolute sm:right-0 sm:top-[calc(100%+0.5rem)]"
        >
          <div className="px-1 pb-3 pt-1">
            <h2 className="text-[13px] font-semibold text-foreground">Workspace layout</h2>
            <p className="mt-0.5 text-[11.5px] text-subtle">Choose what stays beside the lecture.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {options.map((option) => {
              const selected = option.value === layout;
              return (
                <Link
                  key={option.value}
                  href={{
                    pathname: "/",
                    query: { ...(lectureId ? { lecture: lectureId } : {}), layout: option.value },
                  }}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`group min-w-0 rounded-xl p-1.5 transition-colors ${
                    selected
                      ? "bg-fill text-foreground ring-1 ring-inset ring-foreground/15"
                      : "text-muted hover:bg-fill hover:text-foreground"
                  }`}
                >
                  <Preview layout={option.value} />
                  <span className="mt-2 flex items-center justify-between gap-1 px-1 text-[12px] font-semibold">
                    {option.label}
                    {selected && (
                      <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
                        <path d="m3 7 2.5 2.5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="mt-0.5 block px-1 pb-1 text-[10.5px] font-normal leading-snug text-subtle">
                    {option.description}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
