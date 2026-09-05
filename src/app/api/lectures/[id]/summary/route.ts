import { generateSummary } from "@/lib/answer";
import { getLecture, saveLecture } from "@/lib/store";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const lecture = await getLecture(id);
  if (!lecture) return Response.json({ error: "That lecture does not exist." }, { status: 404 });
  if (lecture.summary) return Response.json({ summary: lecture.summary });

  try {
    lecture.summary = await generateSummary(lecture.title, lecture.segments);
    await saveLecture(lecture);
    return Response.json({ summary: lecture.summary });
  } catch (error) {
    console.error("Summary generation failed", error);
    return Response.json(
      { error: "Could not create the AI summary. Check the OpenRouter connection and try again." },
      { status: 502 },
    );
  }
}
