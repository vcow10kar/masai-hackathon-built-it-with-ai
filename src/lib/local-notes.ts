"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { NoteSection } from "./types";

/**
 * Notes a student writes belong to that student's browser, one shelf per
 * lecture, so opening the same video again brings back what they kept and a
 * different lecture never shows someone else's notes.
 *
 * The browser store is the source of truth rather than a copy kept in sync
 * with React state: a note added in one place is then read back the same way
 * everywhere, including after a reload that never reached the server.
 */
const KEY_PREFIX = "ask-the-lecture:notes:";

const keyFor = (lectureId: string) => `${KEY_PREFIX}${lectureId}`;

/** Snapshots have to be referentially stable, so parsed notes are kept here. */
const cache = new Map<string, NoteSection[]>();
const listeners = new Map<string, Set<() => void>>();

/** One empty array, so an empty shelf is the same snapshot every time. */
const EMPTY: NoteSection[] = [];

function isNote(value: unknown): value is NoteSection {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<NoteSection>;
  return (
    typeof note.id === "string" &&
    typeof note.heading === "string" &&
    typeof note.body === "string" &&
    (note.kind === undefined || note.kind === "note" || note.kind === "summary")
  );
}

/**
 * What this browser has kept for one lecture. Storage can be unavailable or
 * hold something another version wrote, so anything unreadable reads as an
 * empty shelf rather than being thrown at the student.
 */
function read(lectureId: string): NoteSection[] {
  try {
    const raw = window.localStorage.getItem(keyFor(lectureId));
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const notes = parsed.filter(isNote);
    return notes.length > 0 ? notes : EMPTY;
  } catch {
    return EMPTY;
  }
}

function snapshot(lectureId: string): NoteSection[] {
  const cached = cache.get(lectureId);
  if (cached) return cached;
  const notes = read(lectureId);
  cache.set(lectureId, notes);
  return notes;
}

function notify(lectureId: string) {
  for (const listener of listeners.get(lectureId) ?? []) listener();
}

/** Keeps this lecture's notes in the browser. An empty shelf clears the entry. */
export function writeStoredNotes(lectureId: string, notes: NoteSection[]) {
  cache.set(lectureId, notes.length > 0 ? notes : EMPTY);

  try {
    if (notes.length === 0) window.localStorage.removeItem(keyFor(lectureId));
    else window.localStorage.setItem(keyFor(lectureId), JSON.stringify(notes));
  } catch {
    // A full or blocked store is not worth interrupting the lesson for. The
    // notes still work for this session, and the workspace copy the server
    // keeps is written either way.
  }

  notify(lectureId);
}

/**
 * This browser's notes for one lecture, and a way to change them. Another tab
 * writing the same lecture updates this one, which is what a student expects
 * from two views of the same video.
 */
export function useStoredNotes(lectureId: string | null) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!lectureId) return () => {};

      const forLecture = listeners.get(lectureId) ?? new Set();
      forLecture.add(listener);
      listeners.set(lectureId, forLecture);

      // Another tab's write arrives as a storage event, and only that tab's
      // own cache was updated.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== keyFor(lectureId)) return;
        cache.delete(lectureId);
        notify(lectureId);
      };
      window.addEventListener("storage", onStorage);

      return () => {
        forLecture.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    [lectureId],
  );

  const notes = useSyncExternalStore(
    subscribe,
    () => (lectureId ? snapshot(lectureId) : EMPTY),
    // The server has no browser store to read, so it renders the empty shelf
    // and the real one arrives on hydration.
    () => EMPTY,
  );

  const setNotes = useCallback(
    (update: NoteSection[] | ((current: NoteSection[]) => NoteSection[])) => {
      if (!lectureId) return;
      const current = snapshot(lectureId);
      writeStoredNotes(lectureId, typeof update === "function" ? update(current) : update);
    },
    [lectureId],
  );

  return [notes, setNotes] as const;
}
