import "server-only";

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TranscriptSegment } from "./types";

export type Lecture = {
  id: string;
  title: string;
  uploader: string;
  url: string;
  durationSeconds: number;
  /** Where the transcript came from: the video's captions, or local Whisper. */
  source: "captions" | "whisper";
  ingestedAt: string;
  segments: TranscriptSegment[];
};

export type LectureSummary = Omit<Lecture, "segments"> & {
  segmentCount: number;
  /** Seconds of the recording the transcript actually covers. */
  coveredSeconds: number;
};

const LECTURE_DIR = join(process.cwd(), "data", "lectures");

async function readLecture(fileName: string): Promise<Lecture | null> {
  try {
    return JSON.parse(await readFile(join(LECTURE_DIR, fileName), "utf8")) as Lecture;
  } catch {
    return null;
  }
}

export async function getLecture(id: string): Promise<Lecture | null> {
  // Guard against an id from the URL escaping the lecture directory.
  if (!/^[\w-]+$/.test(id)) return null;
  return readLecture(`${id}.json`);
}

export async function listLectures(): Promise<LectureSummary[]> {
  let fileNames: string[];
  try {
    fileNames = (await readdir(LECTURE_DIR)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }

  const lectures = await Promise.all(fileNames.map(readLecture));

  return lectures
    .filter((lecture): lecture is Lecture => lecture !== null)
    .map(({ segments, ...rest }) => ({
      ...rest,
      segmentCount: segments.length,
      coveredSeconds: segments.length > 0 ? segments[segments.length - 1].end : 0,
    }))
    .sort((a, b) => b.ingestedAt.localeCompare(a.ingestedAt));
}
