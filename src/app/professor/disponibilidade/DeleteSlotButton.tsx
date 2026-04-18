"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSlotAction } from "./actions";
import { X } from "lucide-react";

export function DeleteSlotButton({ slotId }: { slotId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("slot_id", slotId);
      const result = await deleteSlotAction({}, fd);
      if (result.error) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  if (error) {
    return (
      <span className="text-xs text-accent" title={error}>
        {error.length > 30 ? error.slice(0, 30) + "…" : error}
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-muted">Confirmar?</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="text-accent hover:underline disabled:opacity-50"
        >
          {isPending ? "…" : "Sim"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-muted hover:text-ink"
        >
          Não
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-muted hover:text-accent transition-colors p-1"
      aria-label="Remover horário"
    >
      <X className="w-4 h-4" />
    </button>
  );
}
