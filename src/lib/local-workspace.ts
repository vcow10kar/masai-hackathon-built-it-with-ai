"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { ChatThread, NoteSection } from "./types";

/**
 * A student's chats and notes belong to their own browser, one shelf per
 * lecture, so opening the same video again brings back what they left and a
 * different lecture never shows someone else's work.
 *
 * The browser store is the source of truth rather than a copy kept in sync
 * with React state: what was written is what is read back everywhere,
 * including after a reload that never reached the server.
 */
type Shelf<T> = {
  /** Distinguishes one kind of stored thing from another within a lecture. */
  prefix: string;
  /** Storage holds whatever an older version wrote, so every item is checked. */
  isValid: (value: unknown) => value is T;
  /** Applied to what comes out of storage, for state that must not persist. */
  settle?: (items: T[]) => T[];
  /** Applied on the way in, for anything the shelf itself should record. */
  stamp?: (next: T[], previous: T[]) => T[];
};

/** Snapshots have to be referentially stable, so parsed items are kept here. */
const cache = new Map<string, unknown[]>();
const listeners = new Map<string, Set<() => void>>();

/** One empty array, so an empty shelf is the same snapshot every time. */
const EMPTY: never[] = [];

function keyFor<T>(shelf: Shelf<T>, lectureId: string) {
  return `ask-the-lecture:${shelf.prefix}:${lectureId}`;
}

function read<T>(shelf: Shelf<T>, lectureId: string): T[] | null {
  try {
    const raw = window.localStorage.getItem(keyFor(shelf, lectureId));
    // No entry at all is different from an empty one: only the first can be
    // filled from what the server still holds.
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const items = parsed.filter(shelf.isValid);
    return shelf.settle ? shelf.settle(items) : items;
  } catch {
    return null;
  }
}

function snapshot<T>(shelf: Shelf<T>, lectureId: string, seed: T[]): T[] {
  const key = keyFor(shelf, lectureId);
  const cached = cache.get(key) as T[] | undefined;
  if (cached) return cached;

  // Whatever the server kept before this moved into the browser is worth
  // carrying over once, rather than making the student start again.
  const stored = read(shelf, lectureId);
  const items = stored ?? seed;
  cache.set(key, items);
  return items;
}

function notify(key: string) {
  for (const listener of listeners.get(key) ?? []) listener();
}

function write<T>(shelf: Shelf<T>, lectureId: string, items: T[]) {
  const key = keyFor(shelf, lectureId);
  const previous = (cache.get(key) as T[] | undefined) ?? [];
  const stamped = shelf.stamp ? shelf.stamp(items, previous) : items;
  cache.set(key, stamped);

  try {
    window.localStorage.setItem(key, JSON.stringify(stamped));
  } catch {
    // A full or blocked store is not worth interrupting the lesson for: the
    // work still stands for this session.
  }

  notify(key);
}

function useShelf<T>(shelf: Shelf<T>, lectureId: string | null, seed: T[]) {
  const key = lectureId ? keyFor(shelf, lectureId) : null;

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key || !lectureId) return () => {};

      const forShelf = listeners.get(key) ?? new Set();
      forShelf.add(listener);
      listeners.set(key, forShelf);

      // Another tab's write arrives as a storage event; only that tab updated
      // its own cache.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key) return;
        cache.delete(key);
        notify(key);
      };
      window.addEventListener("storage", onStorage);

      return () => {
        forShelf.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key, lectureId],
  );

  const items = useSyncExternalStore(
    subscribe,
    () => (lectureId ? snapshot(shelf, lectureId, seed) : (EMPTY as T[])),
    // The server has no browser store to read, so it renders what it holds and
    // the browser's own shelf arrives on hydration.
    () => seed,
  );

  const setItems = useCallback(
    (update: T[] | ((current: T[]) => T[])) => {
      if (!lectureId) return;
      const current = snapshot(shelf, lectureId, seed);
      write(shelf, lectureId, typeof update === "function" ? update(current) : update);
    },
    [shelf, lectureId, seed],
  );

  return [items, setItems] as const;
}

function isNote(value: unknown): value is NoteSection {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<NoteSection>;
  return (
    typeof note.id === "string" && typeof note.heading === "string" && typeof note.body === "string"
  );
}

function isChat(value: unknown): value is ChatThread {
  if (!value || typeof value !== "object") return false;
  const chat = value as Partial<ChatThread>;
  return (
    typeof chat.id === "string" &&
    typeof chat.title === "string" &&
    Array.isArray(chat.messages) &&
    chat.messages.every(
      (message) =>
        typeof message?.id === "string" &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
  );
}

const NOTES: Shelf<NoteSection> = { prefix: "notes", isValid: isNote };

const CHATS: Shelf<ChatThread> = {
  prefix: "chats",
  isValid: isChat,
  // A chat interrupted mid-answer would otherwise come back stuck waiting for
  // a request that no longer exists.
  settle: (chats) => chats.map((chat) => ({ ...chat, pending: false, error: null })),
  // Stamped here rather than at each call site, so every route to a new
  // message dates the thread the same way.
  stamp: (next, previous) =>
    next.map((chat) => {
      const before = previous.find((item) => item.id === chat.id);
      const changed = before?.messages.length !== chat.messages.length;
      return changed ? { ...chat, updatedAt: new Date().toISOString() } : chat;
    }),
};

/**
 * Lectures this browser has closed. The library still holds them: closing a
 * tab puts a lecture away rather than deleting the transcript, which is what
 * the library's own Delete is for.
 */
const CLOSED_LECTURES: Shelf<string> = {
  prefix: "closed-lectures",
  isValid: (value): value is string => typeof value === "string",
};

/** The one list of closed lectures, not a per-lecture shelf. */
export function useClosedLectures() {
  return useShelf(CLOSED_LECTURES, "all", EMPTY as string[]);
}

/** This browser's notes for one lecture, and a way to change them. */
export function useStoredNotes(lectureId: string | null, seed: NoteSection[] = EMPTY) {
  return useShelf(NOTES, lectureId, seed);
}

/** This browser's chats for one lecture, and a way to change them. */
export function useStoredChats(lectureId: string | null, seed: ChatThread[] = EMPTY) {
  return useShelf(CHATS, lectureId, seed);
}
