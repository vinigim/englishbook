"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveVideoMetadataAction } from "./actions";
import { Input, Label } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { LessonTopic } from "@/lib/types";

type Props = {
  teacherId: string;
  topics: LessonTopic[];
};

export function VideoUploadForm({ teacherId, topics }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = e.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string).trim();
    const description = (formData.get("description") as string).trim();
    const topicId = (formData.get("topic_id") as string) || null;

    if (!file || file.size === 0) {
      setFieldErrors({ file: "Selecione um arquivo de vídeo." });
      return;
    }
    if (!title) {
      setFieldErrors({ title: "Título obrigatório." });
      return;
    }

    setUploading(true);
    setProgress("Enviando vídeo…");

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "mp4";
      const safeName = file.name
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9]/g, "_")
        .slice(0, 60);
      const storagePath = `${teacherId}/${Date.now()}-${safeName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("teacher-videos")
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setError(`Erro no upload: ${uploadError.message}`);
        return;
      }

      setProgress("Salvando informações…");

      const result = await saveVideoMetadataAction({
        title,
        description: description || undefined,
        topic_id: topicId,
        storage_path: storagePath,
      });

      if (result.error) {
        // Tenta remover o arquivo já enviado para não deixar órfão
        await supabase.storage.from("teacher-videos").remove([storagePath]);
        setError(result.error);
        return;
      }
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
        await supabase.storage.from("teacher-videos").remove([storagePath]);
        return;
      }

      form.reset();
      if (fileRef.current) fileRef.current.value = "";
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-11 px-6 border border-ink text-ink hover:bg-ink hover:text-paper transition-colors text-sm font-medium"
      >
        + Adicionar vídeo
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-ink p-6 space-y-6 max-w-2xl"
    >
      <h2 className="font-display text-xl tracking-tight">Novo vídeo</h2>

      {error ? <Alert variant="danger">{error}</Alert> : null}
      {progress ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="inline-block w-4 h-4 border-2 border-ink border-t-transparent rounded-full animate-spin" />
          {progress}
        </div>
      ) : null}

      {/* Arquivo */}
      <div>
        <Label htmlFor="file">Arquivo de vídeo</Label>
        <input
          ref={fileRef}
          id="file"
          name="file"
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/*"
          disabled={uploading}
          className={cn(
            "block w-full text-sm text-muted file:mr-4 file:py-2 file:px-4",
            "file:border file:border-line file:text-ink file:bg-paper",
            "hover:file:border-ink hover:file:cursor-pointer",
            fieldErrors.file && "border border-accent p-1"
          )}
        />
        {fieldErrors.file ? (
          <p className="text-xs text-accent mt-1">{fieldErrors.file}</p>
        ) : (
          <p className="text-xs text-muted mt-1">
            MP4 ou WebM recomendado · máx. 500 MB
          </p>
        )}
      </div>

      {/* Título */}
      <div>
        <Label htmlFor="vtitle">Título</Label>
        <Input
          id="vtitle"
          name="title"
          placeholder="Ex: Vocabulário para reuniões de negócios"
          disabled={uploading}
          error={fieldErrors.title}
        />
      </div>

      {/* Tópico */}
      {topics.length > 0 ? (
        <div>
          <Label htmlFor="vtopic">Tópico (opcional)</Label>
          <select
            id="vtopic"
            name="topic_id"
            disabled={uploading}
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

      {/* Descrição */}
      <div>
        <Label htmlFor="vdesc">Descrição (opcional)</Label>
        <textarea
          id="vdesc"
          name="description"
          rows={3}
          maxLength={2000}
          disabled={uploading}
          placeholder="Descreva o conteúdo do vídeo…"
          className="w-full px-4 py-3 bg-paper border border-line text-ink placeholder:text-muted resize-y focus:outline-none focus:border-ink transition-colors"
        />
      </div>

      <div className="flex items-center gap-4 pt-2 border-t border-line">
        <button
          type="submit"
          disabled={uploading}
          className="h-11 px-6 bg-ink text-paper font-medium hover:bg-accent transition-colors disabled:bg-muted"
        >
          {uploading ? "Enviando…" : "Enviar vídeo"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setFieldErrors({});
          }}
          disabled={uploading}
          className="text-sm text-muted hover:text-ink transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
