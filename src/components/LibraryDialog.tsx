"use client";

import { useRef, useState } from "react";

export function LibraryDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  function openLibrary() {
    setOpen(true);
    setLoading(true);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openLibrary}
        className="rounded-full px-3 py-1 text-[13px] font-medium text-accent-ink transition-colors hover:bg-accent-wash"
      >
        Library
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="library-dialog-title"
        onClose={() => setOpen(false)}
        onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
        className="m-auto h-[min(48rem,calc(100dvh-2rem))] w-[min(56rem,calc(100vw-2rem))] rounded-2xl border border-edge bg-surface p-0 text-foreground shadow-raised backdrop:bg-black/70"
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl">
          <header className="flex shrink-0 items-center justify-between border-b border-separator px-5 py-4">
            <h2 id="library-dialog-title" className="display text-[20px] leading-none">
              Library
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close library"
              className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-foreground"
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                <path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="relative min-h-0 flex-1">
            {loading && (
              <div role="status" className="absolute inset-0 grid place-items-center bg-surface">
                <div className="text-center">
                  <svg viewBox="0 0 24 24" className="mx-auto size-6 animate-spin text-accent-ink motion-reduce:animate-none" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
                    <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <p className="mt-3 text-[13px] text-subtle">Loading library…</p>
                </div>
              </div>
            )}
            {open && (
              <iframe
                src="/library?embed=1"
                title="Lecture library"
                onLoad={() => setLoading(false)}
                className={`h-full w-full border-0 transition-opacity ${loading ? "opacity-0" : "opacity-100"}`}
              />
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
