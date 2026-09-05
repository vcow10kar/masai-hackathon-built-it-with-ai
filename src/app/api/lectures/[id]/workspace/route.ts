import { getLecture, saveLectureWorkspace } from "@/lib/store";
import type { ChatThread, LectureWorkspaceData, NoteSection } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

function validWorkspace(value: unknown): value is LectureWorkspaceData {
  if (!value || typeof value !== "object") return false;
  const { chats, notes } = value as { chats?: ChatThread[]; notes?: NoteSection[] };
  return (
    Array.isArray(chats) &&
    chats.length <= 50 &&
    chats.every(
      (chat) =>
        typeof chat?.id === "string" &&
        typeof chat.title === "string" &&
        chat.title.length <= 200 &&
        Array.isArray(chat.messages) &&
        chat.messages.length <= 200 &&
        chat.messages.every(
          (message) =>
            typeof message?.id === "string" &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            message.content.length <= 20_000,
        ),
    ) &&
    Array.isArray(notes) &&
    notes.length <= 500 &&
    notes.every(
      (note) =>
        typeof note?.id === "string" &&
        typeof note.heading === "string" &&
        note.heading.length <= 200 &&
        typeof note.body === "string" &&
        note.body.length <= 20_000,
    )
  );
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body: unknown = await request.json().catch(() => null);

  if (!validWorkspace(body)) {
    return Response.json({ error: "Invalid chats or notes." }, { status: 400 });
  }

  try {
    if (!(await getLecture(id))) {
      return Response.json({ error: "That lecture does not exist." }, { status: 404 });
    }
    await saveLectureWorkspace(id, { chats: body.chats, notes: body.notes });
    return Response.json({ saved: true });
  } catch (error) {
    console.error("Workspace save failed", error);
    return Response.json({ error: "Could not save chats and notes." }, { status: 502 });
  }
}
