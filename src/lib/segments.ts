import type { TranscriptSegment } from "./types";

/**
 * Index of the segment being spoken at `seconds`, or -1 when playback has not
 * started or sits before the first segment.
 */
export function activeSegmentIndex(transcript: TranscriptSegment[], seconds: number | null) {
  if (seconds === null) return -1;
  let index = -1;
  for (let i = 0; i < transcript.length; i += 1) {
    if (transcript[i].start <= seconds) index = i;
    else break;
  }
  return index;
}
