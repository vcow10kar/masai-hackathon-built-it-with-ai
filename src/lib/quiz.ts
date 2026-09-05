import type { QuizQuestion, TranscriptSegment } from "./types";

type RawQuestion = Omit<QuizQuestion, "start" | "options"> & { options: unknown };

/** Validate model output and resolve each citation to an exact lecture timestamp. */
export function parseQuiz(value: unknown, segments: TranscriptSegment[]): QuizQuestion[] {
  const questions = (value as { questions?: unknown })?.questions;
  if (!Array.isArray(questions) || questions.length !== 5) {
    throw new Error("Quiz must contain five questions.");
  }

  return questions.map((value) => {
    const question = value as Partial<RawQuestion>;
    const correctOption = question.correctOption;
    const segment = segments.find((item) => item.id === question.segmentId);
    if (
      typeof question.question !== "string" ||
      !Array.isArray(question.options) ||
      question.options.length !== 4 ||
      !question.options.every((option) => typeof option === "string") ||
      typeof correctOption !== "number" ||
      !Number.isInteger(correctOption) ||
      correctOption < 0 ||
      correctOption > 3 ||
      typeof question.explanation !== "string" ||
      !segment
    ) {
      throw new Error("Quiz response was incomplete.");
    }

    return {
      question: question.question,
      options: question.options as QuizQuestion["options"],
      correctOption,
      explanation: question.explanation,
      segmentId: segment.id,
      start: segment.start,
    };
  });
}
