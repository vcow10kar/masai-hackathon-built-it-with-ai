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
        className="self-center text-muted underline-offset-4 transition-colors hover:text-danger hover:underline"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-muted">Delete the transcript?</span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Delete ${title}`}
        className="font-medium text-danger underline-offset-4 hover:underline disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-muted underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
      >
        Cancel
      </button>
      {error && <span className="text-danger">{error}</span>}
    </span>
  );
}
