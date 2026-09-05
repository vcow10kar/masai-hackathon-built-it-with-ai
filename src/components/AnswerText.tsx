"use client";

import { Fragment, type ReactNode } from "react";
import { formatTimestamp } from "@/lib/format";
import type { Citation } from "@/lib/types";

type Props = {
  text: string;
  citations: Citation[];
  onCitationClick: (citation: Citation) => void;
};

/** A bullet or numbered line, or a run of prose. */
type Block =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "steps"; items: string[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const STEP = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Groups the answer's lines into blocks. Models write a mix of prose and
 * bullets, and a run of bullets has to become one list so the spacing between
 * items matches the spacing inside them.
 */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];

  for (const line of text.split("\n")) {
    // An empty bullet reaches the panel from answers saved before the server
    // started dropping them, and renders as a stray dash.
    if (/^\s*[-*•]\s*$/.test(line)) continue;

    const bullet = BULLET.exec(line);
    const step = bullet ? null : STEP.exec(line);
    const previous = blocks.at(-1);

    if (bullet) {
      if (previous?.kind === "bullets") previous.items.push(bullet[1]);
      else blocks.push({ kind: "bullets", items: [bullet[1]] });
      continue;
    }

    if (step) {
      if (previous?.kind === "steps") previous.items.push(step[1]);
      else blocks.push({ kind: "steps", items: [step[1]] });
      continue;
    }

    if (line.trim() === "") {
      // A blank line ends whatever block was open.
      if (previous) blocks.push({ kind: "paragraph", lines: [] });
      continue;
    }

    if (previous?.kind === "paragraph" && previous.lines.length > 0) previous.lines.push(line.trim());
    else blocks.push({ kind: "paragraph", lines: [line.trim()] });
  }

  return blocks.filter((block) => (block.kind === "paragraph" ? block.lines.length > 0 : block.items.length > 0));
}

/** Citation markers, bold, and inline code: the three things models still emit. */
const INLINE = /(\[s\d+\]|\*\*[^*\n]+\*\*|`[^`\n]+`)/g;

/**
 * Renders one line, turning each [s7] into a chip that jumps to that moment.
 * A marker sitting in the sentence it supports is more useful than the same id
 * printed as text, which is what the student saw before.
 */
function inlineNodes(
  line: string,
  starts: Map<string, number>,
  onCitationClick: (citation: Citation) => void,
): ReactNode[] {
  return line.split(INLINE).map((piece, index) => {
    const marker = /^\[(s\d+)\]$/.exec(piece);
    if (marker) {
      const segmentId = marker[1];
      const start = starts.get(segmentId);
      // An id with no segment behind it should never have reached the client,
      // but printing nothing beats printing a chip that jumps nowhere.
      if (start === undefined) return null;
      return (
        <button
          key={index}
          type="button"
          onClick={() => onCitationClick({ kind: "transcript", segmentId, start })}
          title={`Jump to ${formatTimestamp(start)}`}
          className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded-full bg-accent-wash px-1.5 py-px align-middle font-mono text-[10.5px] font-medium tabular-nums text-accent-ink transition-colors hover:bg-accent-wash-hover"
        >
          {formatTimestamp(start)}
        </button>
      );
    }

    if (piece.startsWith("**") && piece.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {piece.slice(2, -2)}
        </strong>
      );
    }

    if (piece.startsWith("`") && piece.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-fill px-1 py-px font-mono text-[12.5px]">
          {piece.slice(1, -1)}
        </code>
      );
    }

    return <Fragment key={index}>{piece}</Fragment>;
  });
}

/**
 * The answer as the student reads it: paragraphs, lists, and citations as
 * chips they can click. Deliberately a small subset rather than full markdown,
 * because the prompt asks the model for plain text and anything richer arriving
 * here is a sign the answer went off format.
 */
export function AnswerText({ text, citations, onCitationClick }: Props) {
  const starts = new Map(
    citations
      .filter((citation): citation is Extract<Citation, { kind: "transcript" }> => citation.kind === "transcript")
      .map((citation) => [citation.segmentId, citation.start]),
  );

  const render = (line: string) => inlineNodes(line, starts, onCitationClick);

  return (
    <div className="space-y-2.5">
      {toBlocks(text).map((block, index) => {
        if (block.kind === "bullets") {
          return (
            <ul key={index} className="space-y-1.5 pl-1">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="flex gap-2">
                  <span aria-hidden="true" className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
                  <span className="min-w-0">{render(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.kind === "steps") {
          return (
            <ol key={index} className="space-y-1.5 pl-1">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="flex gap-2">
                  <span aria-hidden="true" className="w-4 shrink-0 text-right font-mono text-[12px] tabular-nums text-muted">
                    {itemIndex + 1}.
                  </span>
                  <span className="min-w-0">{render(item)}</span>
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={index} className="whitespace-pre-wrap">
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && " "}
                {render(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
