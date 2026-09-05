import { isRemoteStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Reports which integrations are configured. Names only, never values. */
export function GET() {
  return Response.json({
    store: isRemoteStore() ? "supabase" : "filesystem",
    transcripts: process.env.SUPADATA_API_KEY ? "hosted" : "local yt-dlp",
    answers: process.env.OPENROUTER_API_KEY
      ? "openrouter"
      : process.env.ANTHROPIC_API_KEY
        ? "anthropic"
        : "ollama",
  });
}
