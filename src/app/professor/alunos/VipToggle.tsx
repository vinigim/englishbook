"use client";

import { useState, useTransition } from "react";
import { setVipAction } from "./actions";
import { cn } from "@/lib/utils";

type Props = {
  teacherId: string;
  studentId: string;
  initialIsVip: boolean;
};

export function VipToggle({ studentId, initialIsVip }: Props) {
  const [isVip, setIsVip] = useState(initialIsVip);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setVipAction(studentId, !isVip);
      if (result.error) {
        setError(result.error);
      } else {
        setIsVip((v) => !v);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={isPending}
        className={cn(
          "px-3 py-1 text-xs font-medium border transition-colors disabled:opacity-50",
          isVip
            ? "border-ink bg-ink text-paper hover:bg-accent hover:border-accent"
            : "border-line hover:border-ink"
        )}
      >
        {isPending ? "…" : isVip ? "VIP ✓" : "Tornar VIP"}
      </button>
      {error ? <p className="text-xs text-accent">{error}</p> : null}
    </div>
  );
}
