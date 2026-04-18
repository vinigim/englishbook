"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";

type Props = {
  slotId: string;
  startAt: string;
  endAt: string;
  teacherName: string;
};

export function BookSlotButton({ slotId, startAt, endAt, teacherName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot_id: slotId }),
        });

        const data = await res.json();

        if (!res.ok) {
          // Mapeia erros conhecidos pra mensagem amigável
          const code = data?.error as string | undefined;
          switch (code) {
            case "slot_not_available":
              setError("Esse horário acabou de ser reservado. Escolha outro.");
              // Recarrega a lista após 1.5s
              setTimeout(() => router.refresh(), 1500);
              break;
            case "slot_in_past":
              setError("Esse horário já passou.");
              break;
            case "teacher_inactive":
              setError("Esse professor não está mais disponível.");
              break;
            case "slot_not_found":
              setError("Horário não encontrado.");
              break;
            default:
              setError(data?.message || "Algo deu errado. Tente novamente.");
          }
          return;
        }

        if (data?.checkout_url) {
          // Redirect pro Stripe Checkout
          window.location.href = data.checkout_url;
        } else {
          setError("Resposta inesperada do servidor.");
        }
      } catch {
        setError("Falha de conexão. Verifique sua internet.");
      }
    });
  }

  return (
    <div className="flex flex-col items-stretch">
      <button
        onClick={handleClick}
        disabled={isPending}
        aria-label={`Reservar com ${teacherName} às ${formatTime(startAt)}`}
        className={cn(
          "group relative border border-line px-4 py-3 text-left",
          "hover:border-ink hover:bg-ink hover:text-paper transition-colors",
          "disabled:opacity-60 disabled:cursor-not-allowed"
        )}
      >
        <div className="font-display text-lg tracking-tight">
          {formatTime(startAt)}
        </div>
        <div className="text-xs text-muted group-hover:text-paper/70 transition-colors">
          até {formatTime(endAt)}
        </div>
        {isPending ? (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/80 text-paper text-sm">
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </span>
        ) : null}
      </button>
      {error ? (
        <p className="text-xs text-accent mt-1.5 leading-snug">{error}</p>
      ) : null}
    </div>
  );
}
