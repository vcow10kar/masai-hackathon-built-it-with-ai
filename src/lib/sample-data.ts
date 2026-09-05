import type { NoteSection, TranscriptSegment } from "./types";

/**
 * Placeholder content so the layout can be built and reviewed before the real
 * transcript pipeline exists. Replace with the generated lecture JSON.
 */
export const sampleTranscript: TranscriptSegment[] = [
  { id: "t1", start: 0, end: 42, text: "Introduction and what this lecture covers." },
  { id: "t2", start: 42, end: 155, text: "Definitions and the first worked example." },
  { id: "t3", start: 155, end: 320, text: "The part students usually get stuck on." },
  { id: "t4", start: 320, end: 505, text: "Second worked example, done step by step." },
  { id: "t5", start: 505, end: 690, text: "Common mistakes and how to avoid them." },
  { id: "t6", start: 690, end: 840, text: "Recap and what to revise before the exam." },
];

export const sampleNotes: NoteSection[] = [
  { id: "n1", heading: "Overview", body: "One-paragraph summary of the lecture." },
  { id: "n2", heading: "Key definitions", body: "The terms introduced, with short explanations." },
  { id: "n3", heading: "Worked examples", body: "The examples the lecturer solved on screen." },
  { id: "n4", heading: "Exam pointers", body: "What the lecturer flagged as likely to be tested." },
];

export const sampleLecture = {
  title: "Lecture 4 — Placeholder Title",
  course: "Placeholder Course",
  durationSeconds: 840,
};
