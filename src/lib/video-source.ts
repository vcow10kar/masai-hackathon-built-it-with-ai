export type VideoSource =
  | { kind: "youtube"; videoId: string; url: string }
  | { kind: "file"; url: string };

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

const VIDEO_ID = /^[\w-]{11}$/;

/** Pulls the video id out of the watch, share, embed, shorts and live forms. */
function youtubeVideoId(url: URL): string | null {
  if (url.hostname.endsWith("youtu.be")) {
    const id = url.pathname.split("/").filter(Boolean)[0];
    return id && VIDEO_ID.test(id) ? id : null;
  }

  const fromQuery = url.searchParams.get("v");
  if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;

  const [prefix, id] = url.pathname.split("/").filter(Boolean);
  if (["embed", "shorts", "live", "v"].includes(prefix) && id && VIDEO_ID.test(id)) {
    return id;
  }

  return null;
}

/**
 * Accepts a YouTube link or a direct link to a video file. Returns null when
 * the input is neither, so the caller can tell the user what is supported.
 */
export function parseVideoSource(input: string): VideoSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const videoId = youtubeVideoId(url);
    return videoId ? { kind: "youtube", videoId, url: trimmed } : null;
  }

  return { kind: "file", url: trimmed };
}
