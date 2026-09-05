/** Parsing for WebVTT caption files, including YouTube's rolling auto-captions. */

const TIMING = /^((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[.,]\d{3})/;

function toSeconds(stamp) {
  const parts = stamp.replace(",", ".").split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Strips karaoke timing tags and cue tags that auto-captions embed. */
function cleanCueText(raw) {
  return raw
    .replace(/<\d{2}:\d{2}:\d{2}[.,]\d{3}>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * YouTube auto-captions repeat the previous cue's last line at the top of the
 * next cue so text scrolls on screen. Keeping only lines not already carried
 * over turns that back into a clean, non-duplicated transcript.
 */
export function parseVtt(content) {
  const blocks = content.replace(/\r/g, "").split("\n\n");
  const segments = [];
  let carried = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) => TIMING.test(line));
    if (timingIndex === -1) continue;

    const [, startStamp, endStamp] = lines[timingIndex].match(TIMING);
    const cueLines = lines
      .slice(timingIndex + 1)
      .map(cleanCueText)
      .filter(Boolean);

    const fresh = cueLines.filter((line) => !carried.includes(line));
    carried = cueLines;
    if (fresh.length === 0) continue;

    const text = fresh.join(" ").trim();
    if (!text) continue;

    const previous = segments[segments.length - 1];
    if (previous && previous.text === text) {
      previous.end = toSeconds(endStamp);
      continue;
    }

    segments.push({
      start: toSeconds(startStamp),
      end: toSeconds(endStamp),
      text,
    });
  }

  return segments;
}

/**
 * Caption cues are a few words long, which is too small to retrieve over.
 * Merges them into passages that are big enough to answer from while keeping
 * the start time of the first cue, since that is what the player seeks to.
 */
export function mergeSegments(segments, { maxSeconds = 45, maxChars = 700 } = {}) {
  const merged = [];

  for (const segment of segments) {
    const current = merged[merged.length - 1];
    const wouldRun = current ? segment.end - current.start : 0;
    const wouldLength = current ? current.text.length + segment.text.length + 1 : 0;

    if (current && wouldRun <= maxSeconds && wouldLength <= maxChars) {
      current.end = segment.end;
      current.text = `${current.text} ${segment.text}`.trim();
    } else {
      merged.push({ ...segment });
    }
  }

  return merged.map((segment, index) => ({ id: `s${index + 1}`, ...segment }));
}
