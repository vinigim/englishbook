"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import type { LessonTopic } from "@/lib/types";

type Props = {
  slotId: string;
  startAt: string;
  endAt: string;
  teacherName: string;
  teacherTopics: LessonTopic[];
};

type Phase = "idle" | "selecting_topic" | "loading";

export function BookSlotButton({
  slotId,
  startAt,
  endAt,
  teacherName,
  teacherTopics,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  async function checkout(topicId: string | null) {
    setError(null);
    setPhase("loading");
    startTransition(async () => {
      try {
        const body: { slot_id: string; topic_id?: string } = {
          slot_id: slotId,
        };
        if (topicId) body.topic_id = topicId;

        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
          const code = data?.error as string | undefined;
          setPhase("idle");
          switch (code) {
            case "slot_not_available":
              setError("Esse horário acabou de ser reservado. Escolha outro.");
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
          window.location.href = data.checkout_url;
        } else {
          setPhase("idle");
          setError("Resposta inesperada do servidor.");
        }
      } catch {
        setPhase("idle");
        setError("Falha de conexão. Verifique sua internet.");
      }
    });
  }

  function handleClick() {
    if (teacherTopics.length > 0) {
      setError(null);
      setPhase("selecting_topic");
    } else {
      checkout(null);
    }
  }

  const isLoading = phase === "loading" || (phase === "idle" && isPending);

  if (phase === "selecting_topic") {
    return (
      <div className="col-span-full border border-ink p-4 bg-paper">
        <p className="text-xs tracking-[0.15em] uppercase text-muted mb-1">
          {formatTime(startAt)} — {formatTime(endAt)}
        </p>
        <p className="font-medium mb-3">Escolha o tópico da aula</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => checkout(null)}
            className="px-3 py-1.5 text-sm border border-line hover:border-ink hover:bg-ink hover:text-paper transition-colors"
          >
            Aula geral
          </button>
          {teacherTopics.map((topic) => (
            <button
              key={topic.id}
              onClick={() => checkout(topic.id)}
              className="px-3 py-1.5 text-sm border border-line hover:border-ink hover:bg-ink hover:text-paper transition-colors"
            >
              {topic.name}
            </button>
          ))}
        </div>
        <button
          onClick={() => setPhase("idle")}
          className="text-xs text-muted hover:text-ink transition-colors"
        >
          ← Cancelar
        </button>
        {error ? (
          <p className="text-xs text-accent mt-2 leading-snug">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch">
      <button
        onClick={handleClick}
        disabled={isLoading}
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
        {isLoading ? (
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
