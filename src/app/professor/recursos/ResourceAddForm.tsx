"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createResourceAction } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Badge";
import { RESOURCE_TYPE_LABELS } from "@/lib/types";
import type { LessonTopic } from "@/lib/types";

const TYPES = Object.entries(RESOURCE_TYPE_LABELS) as [
  keyof typeof RESOURCE_TYPE_LABELS,
  string
][];

type Props = { topics: LessonTopic[] };

export function ResourceAddForm({ topics }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const fd = new FormData(e.currentTarget);
    const data = {
      title: fd.get("title") as string,
      url: (fd.get("url") as string).trim(),
      type: fd.get("type") as string,
      topic_id: (fd.get("topic_id") as string) || null,
      description: fd.get("description") as string,
    };

    startTransition(async () => {
      const result = await createResourceAction(data);
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-11 px-6 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors text-sm font-medium"
      >
        + Adicionar indicação
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink p-6 space-y-6 max-w-2xl">
      <h2 className="font-display text-xl tracking-tight">Nova indicação</h2>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      {/* Título */}
      <div>
        <Label htmlFor="rtitle">Título</Label>
        <Input
          id="rtitle"
          name="title"
          placeholder="Ex: Podcast BBC Learning English"
          disabled={isPending}
          error={fieldErrors.title}
        />
      </div>

      {/* URL */}
      <div>
        <Label htmlFor="rurl">Link (URL)</Label>
        <Input
          id="rurl"
          name="url"
          type="url"
          placeholder="https://"
          disabled={isPending}
          error={fieldErrors.url}
        />
      </div>

      {/* Tipo + Tópico lado a lado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <Label htmlFor="rtype">Tipo</Label>
          <select
            id="rtype"
            name="type"
            required
            disabled={isPending}
            className="w-full px-4 py-3 bg-paper border border-line text-ink focus:outline-none focus:border-ink transition-colors"
          >
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {fieldErrors.type ? (
            <p className="text-xs text-accent mt-1">{fieldErrors.type}</p>
          ) : null}
        </div>

        {topics.length > 0 ? (
          <div>
            <Label htmlFor="rtopic">Tópico (opcional)</Label>
            <select
              id="rtopic"
              name="topic_id"
              disabled={isPending}
              className="w-full px-4 py-3 bg-paper border border-line text-ink focus:outline-none focus:border-ink transition-colors"
            >
              <option value="">Sem tópico específico</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/* Descrição */}
      <div>
        <Label htmlFor="rdesc">Descrição (opcional)</Label>
        <textarea
          id="rdesc"
          name="description"
          rows={3}
          maxLength={2000}
          disabled={isPending}
          placeholder="Explique por que este conteúdo é relevante…"
          className="w-full px-4 py-3 bg-paper border border-line text-ink placeholder:text-muted resize-y focus:outline-none focus:border-ink transition-colors"
        />
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-line">
        <button
          type="submit"
          disabled={isPending}
          className="h-11 px-6 bg-ink text-paper font-medium hover:bg-accent transition-colors disabled:bg-muted"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setFieldErrors({});
          }}
          disabled={isPending}
          className="text-sm text-muted hover:text-ink transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
