"use client";

import { useState } from "react";
import { formatTimestamp } from "@/lib/format";
import type { QuizQuestion } from "@/lib/types";

type Props = {
  lectureId: string | null;
  storedQuiz: QuizQuestion[] | null;
  onSeek: (seconds: number) => void;
};

export function QuizPanel({ lectureId, storedQuiz, onSeek }: Props) {
  const [quiz, setQuiz] = useState(storedQuiz);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  async function createQuiz() {
    if (!lectureId || pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/lectures/${lectureId}/quiz`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not create the quiz.");
      setQuiz(data.quiz);
      setQuestionIndex(0);
      setAnswers([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the quiz.");
    } finally {
      setPending(false);
    }
  }

  if (pending) {
    return (
      <div role="status" className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 animate-pulse rounded-full bg-fill" />
          <div className="h-3 w-12 animate-pulse rounded-full bg-fill" />
        </div>
        <div className="mt-6 h-5 w-4/5 animate-pulse rounded-full bg-fill" />
        <div className="mt-6 space-y-2.5">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-12 animate-pulse rounded-xl bg-fill" />
          ))}
        </div>
        <p className="mt-5 text-center text-[12px] text-subtle">Building five questions from this lecture…</p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="grid min-h-56 place-items-center p-6 text-center">
        <div className="max-w-sm">
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-accent-wash text-accent-ink">
            <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
              <path d="M5.5 6.25a4.5 4.5 0 0 1 8.55 1.96c0 3.04-4.05 3.04-4.05 5.04m0 2.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <h2 className="mt-4 text-[16px] font-semibold text-foreground">Test what you learned</h2>
          <p className={`mt-1.5 text-[13px] leading-relaxed ${error ? "text-danger" : "text-subtle"}`}>
            {error ?? "Create five questions from this lecture, with explanations and moments to review."}
          </p>
          {lectureId ? (
            <button
              type="button"
              onClick={() => void createQuiz()}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
                <path d="M8 2.25 9.1 5.4 12.25 6.5 9.1 7.6 8 10.75 6.9 7.6 3.75 6.5 6.9 5.4 8 2.25Zm4.25 7.5.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
              {error ? "Try again" : "Add quiz"}
            </button>
          ) : (
            <p className="mt-2 text-[12px] text-subtle">Open a lecture first.</p>
          )}
        </div>
      </div>
    );
  }

  if (questionIndex >= quiz.length) {
    const score = answers.reduce(
      (total, answer, index) => total + Number(answer === quiz[index].correctOption),
      0,
    );

    return (
      <div className="grid min-h-64 place-items-center p-6 text-center" aria-live="polite">
        <div className="max-w-sm">
          <p className="text-[13px] font-medium text-accent-ink">Quiz complete</p>
          <p className="mt-2 text-[32px] font-bold tracking-[-0.03em] text-foreground">
            {score} <span className="text-[18px] font-medium text-muted">/ {quiz.length}</span>
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {score === quiz.length
              ? "Perfect score. You understood every tested idea."
              : score >= 3
                ? "Good work. Review the explanations, then try once more."
                : "A quick replay of the cited moments will make the next attempt easier."}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuestionIndex(0);
              setAnswers([]);
            }}
            className="mt-5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const question = quiz[questionIndex];
  const selected = answers[questionIndex];
  const answered = selected !== undefined;
  const correct = selected === question.correctOption;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-5 sm:px-6" data-testid="quiz-question">
      <div className="flex items-center justify-between gap-4 text-[12px] font-medium">
        <span className="text-muted">Question {questionIndex + 1} of {quiz.length}</span>
        <span className="text-subtle">{answers.filter((answer, index) => answer === quiz[index].correctOption).length} correct</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-fill" aria-hidden="true">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: `${((questionIndex + Number(answered)) / quiz.length) * 100}%` }}
        />
      </div>

      <fieldset className="mt-6">
        <legend className="text-balance text-[17px] font-semibold leading-snug text-foreground">
          {question.question}
        </legend>
        <div className="mt-5 space-y-2.5">
          {question.options.map((option, index) => {
            const isCorrect = index === question.correctOption;
            const isSelected = index === selected;
            const state = answered
              ? isCorrect
                ? "border-accent-line bg-accent-wash text-foreground"
                : isSelected
                  ? "border-danger/60 bg-danger/10 text-foreground"
                  : "border-separator text-subtle opacity-60"
              : "border-separator bg-segment text-muted hover:border-accent-line hover:bg-fill hover:text-foreground";

            return (
              <button
                key={option}
                type="button"
                disabled={answered}
                aria-pressed={isSelected}
                onClick={() => setAnswers((current) => [...current, index])}
                className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[13.5px] leading-snug transition-colors ${state}`}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-current text-[11px] font-semibold">
                  {String.fromCharCode(65 + index)}
                </span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {answered && (
        <div className="mt-5 border-t border-separator pt-4" aria-live="polite">
          <p className={`text-[13px] font-semibold ${correct ? "text-accent-ink" : "text-danger"}`}>
            {correct ? "Correct" : "Not quite"}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{question.explanation}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onSeek(question.start)}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium text-accent-ink transition-colors hover:bg-accent-wash"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.25" />
                <path d="M8 4.75V8l2.25 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Review at {formatTimestamp(question.start)}
            </button>
            <button
              type="button"
              onClick={() => setQuestionIndex((current) => current + 1)}
              className="rounded-full bg-accent px-4 py-2 text-[12px] font-semibold text-on-accent transition-colors hover:bg-accent-hover"
            >
              {questionIndex === quiz.length - 1 ? "See results" : "Next question"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
