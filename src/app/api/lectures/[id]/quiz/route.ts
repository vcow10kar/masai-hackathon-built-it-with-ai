import { generateQuiz } from "@/lib/answer";
import { getLecture, saveLecture } from "@/lib/store";

export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const lecture = await getLecture(id);
  if (!lecture) return Response.json({ error: "That lecture does not exist." }, { status: 404 });
  if (lecture.quiz) return Response.json({ quiz: lecture.quiz });

  try {
    lecture.quiz = await generateQuiz(lecture.title, lecture.segments);
    await saveLecture(lecture);
    return Response.json({ quiz: lecture.quiz });
  } catch (error) {
    console.error("Quiz generation failed", error);
    return Response.json(
      { error: "Could not create the quiz. Check the OpenRouter connection and try again." },
      { status: 502 },
    );
  }
}
