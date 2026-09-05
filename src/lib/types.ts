export type TranscriptSegment = {
  id: string;
  /** Start time in the recording, in seconds. */
  start: number;
  end: number;
  text: string;
  /** Stored once in the first segment's Supabase JSONB object. */
  aiSummary?: string;
};

export type NoteSection = {
  id: string;
  heading: string;
  body: string;
};

export type Citation =
  | { kind: "transcript"; segmentId: string; start: number }
  | { kind: "notes"; sectionId: string; heading: string };

export type FrameAttachment = {
  /** A compressed image data URL used for preview and vision questions. */
  dataUrl: string;
  /** Playback position represented by the image. */
  timestamp: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  frame?: FrameAttachment;
  citations?: Citation[];
};

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
};

export type LectureWorkspaceData = {
  chats: ChatThread[];
  notes: NoteSection[];
};
