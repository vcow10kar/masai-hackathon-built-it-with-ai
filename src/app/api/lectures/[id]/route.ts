import { deleteLecture } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;

  try {
    const removed = await deleteLecture(id);
    if (!removed) {
      return Response.json({ error: "That lecture does not exist." }, { status: 404 });
    }
    return Response.json({ id, deleted: true });
  } catch (error) {
    console.error("Delete failed", error);
    return Response.json({ error: "Could not delete that lecture." }, { status: 502 });
  }
}
