"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  lectureId: string;
  title: string;
};

export function DeleteLectureButton({ lectureId, title }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/lectures/${lectureId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not delete that lecture.");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete that lecture.");
      setPending(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-center text-black/50 underline-offset-4 hover:underline dark:text-white/50"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-black/60 dark:text-white/60">Delete the transcript?</span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Delete ${title}`}
        className="font-medium text-red-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-red-400"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-black/50 underline-offset-4 hover:underline disabled:opacity-50 dark:text-white/50"
      >
        Cancel
      </button>
      {error && <span className="text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
