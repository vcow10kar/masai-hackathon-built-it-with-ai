import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChatThread, LectureWorkspaceData, NoteSection, TranscriptSegment } from "./types";

export type Lecture = {
  id: string;
  title: string;
  uploader: string;
  url: string;
  durationSeconds: number;
  /** Where the transcript came from: the video's captions, or Whisper. */
  source: "captions" | "whisper";
  ingestedAt: string;
  segments: TranscriptSegment[];
  summary?: string;
};

type LectureRow = {
  id: string;
  title: string;
  uploader: string;
  url: string;
  duration_seconds: number;
  source: "captions" | "whisper";
  ingested_at: string;
  segments: TranscriptSegment[];
};

const LECTURE_DIR = join(process.cwd(), "data", "lectures");
const WORKSPACE_DIR = join(process.cwd(), "data", "workspaces");

function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** True when transcripts are stored in Supabase rather than on local disk. */
export function isRemoteStore() {
  return supabase() !== null;
}

function fromRow(row: LectureRow): Lecture {
  return {
    id: row.id,
    title: row.title,
    uploader: row.uploader,
    url: row.url,
    durationSeconds: row.duration_seconds,
    source: row.source,
    ingestedAt: row.ingested_at,
    segments: row.segments,
    summary: row.segments[0]?.aiSummary,
  };
}

function toRow(lecture: Lecture): LectureRow {
  return {
    id: lecture.id,
    title: lecture.title,
    uploader: lecture.uploader,
    url: lecture.url,
    duration_seconds: lecture.durationSeconds,
    source: lecture.source,
    ingested_at: lecture.ingestedAt,
    segments: lecture.segments.map((segment, index) =>
      index === 0 && lecture.summary ? { ...segment, aiSummary: lecture.summary } : segment,
    ),
  };
}

export async function getLecture(id: string): Promise<Lecture | null> {
  // Guard against an id from the URL escaping the lecture directory.
  if (!/^[\w-]+$/.test(id)) return null;

  const client = supabase();
  if (client) {
    const { data, error } = await client.from("lectures").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    return data ? fromRow(data as LectureRow) : null;
  }

  try {
    return JSON.parse(await readFile(join(LECTURE_DIR, `${id}.json`), "utf8")) as Lecture;
  } catch {
    return null;
  }
}

export async function listLectures(): Promise<Lecture[]> {
  const client = supabase();
  if (client) {
    const { data, error } = await client
      .from("lectures")
      .select("*")
      .order("ingested_at", { ascending: false });
    if (error) throw new Error(`Supabase read failed: ${error.message}`);
    return (data as LectureRow[]).map(fromRow);
  }

  let fileNames: string[];
  try {
    fileNames = (await readdir(LECTURE_DIR)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }

  const lectures = await Promise.all(
    fileNames.map(async (name) => {
      try {
        return JSON.parse(await readFile(join(LECTURE_DIR, name), "utf8")) as Lecture;
      } catch {
        return null;
      }
    }),
  );

  return lectures
    .filter((lecture): lecture is Lecture => lecture !== null)
    .sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt));
}

export async function saveLecture(lecture: Lecture): Promise<void> {
  const client = supabase();
  if (client) {
    const { error } = await client.from("lectures").upsert(toRow(lecture));
    if (error) throw new Error(`Supabase write failed: ${error.message}`);
    return;
  }

  await mkdir(LECTURE_DIR, { recursive: true });
  await writeFile(
    join(LECTURE_DIR, `${lecture.id}.json`),
    `${JSON.stringify(lecture, null, 2)}\n`,
  );
}

export async function deleteLecture(id: string): Promise<boolean> {
  if (!/^[\w-]+$/.test(id)) return false;

  const client = supabase();
  if (client) {
    const { error, count } = await client
      .from("lectures")
      .delete({ count: "exact" })
      .eq("id", id);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
    return (count ?? 0) > 0;
  }

  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(join(LECTURE_DIR, `${id}.json`));
    return true;
  } catch {
    return false;
  }
}

function settledChats(chats: ChatThread[]) {
  return chats.map((chat) => ({ ...chat, pending: false, error: null }));
}

export async function getLectureWorkspace(lectureId: string): Promise<LectureWorkspaceData> {
  if (!/^[\w-]+$/.test(lectureId)) return { chats: [], notes: [] };

  const client = supabase();
  if (client) {
    const { data, error } = await client
      .from("lecture_workspaces")
      .select("chats, notes")
      .eq("lecture_id", lectureId)
      .maybeSingle();
    if (!error) {
      return data
        ? { chats: settledChats(data.chats as ChatThread[]), notes: data.notes as NoteSection[] }
        : { chats: [], notes: [] };
    }
    if (error.code !== "PGRST205") {
      throw new Error(`Supabase workspace read failed: ${error.message}`);
    }
  }

  try {
    const data = JSON.parse(
      await readFile(join(WORKSPACE_DIR, `${lectureId}.json`), "utf8"),
    ) as LectureWorkspaceData;
    return { chats: settledChats(data.chats), notes: data.notes };
  } catch {
    return { chats: [], notes: [] };
  }
}

