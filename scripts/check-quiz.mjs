import assert from "node:assert/strict";
import { parseQuiz } from "../src/lib/quiz.ts";

const segments = [{ id: "s1", start: 42, end: 50, text: "A useful fact." }];
const question = {
  question: "Which fact was taught?",
  options: ["A", "B", "C", "D"],
  correctOption: 0,
  explanation: "The lecture says A.",
  segmentId: "s1",
};

const quiz = parseQuiz({ questions: Array.from({ length: 5 }, () => ({ ...question })) }, segments);
assert.equal(quiz.length, 5);
assert.equal(quiz[0].start, 42);
assert.throws(() => parseQuiz({ questions: [{ ...question, correctOption: 4 }] }, segments));
