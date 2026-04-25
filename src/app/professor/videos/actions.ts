"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const saveSchema = z.object({
  title: z.string().min(1, "Título obrigatório").max(200),
  description: z.string().max(2000).optional(),
  topic_id: z.string().uuid().nullable(),
  storage_path: z.string().min(1),
});

export type VideoActionResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function saveVideoMetadataAction(
  data: unknown
): Promise<VideoActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sessão expirada." };

  const parsed = saveSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  // Garante que o storage_path está dentro da pasta do professor
  if (!parsed.data.storage_path.startsWith(`${user.id}/`)) {
    return { error: "Caminho inválido." };
  }

  const { error } = await supabase.from("teacher_videos").insert({
    teacher_id: user.id,
    topic_id: parsed.data.topic_id,
    title: parsed.data.title,
    description: parsed.data.description || null,
    storage_path: parsed.data.storage_path,
  });

  if (error) return { error: error.message };

  revalidatePath("/professor/videos");
  return {};
}

export async function deleteVideoAction(
  videoId: string
): Promise<VideoActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sessão expirada." };

  // Busca o video para pegar o storage_path (e confirmar que é do professor)
  const { data: video, error: fetchError } = await supabase
    .from("teacher_videos")
    .select("storage_path")
    .eq("id", videoId)
    .eq("teacher_id", user.id)
    .single();

  if (fetchError || !video) return { error: "Vídeo não encontrado." };

  // Deleta do Storage via admin (sem depender de policy de delete do storage)
  const admin = createAdminClient();
  const { error: storageError } = await admin.storage
    .from("teacher-videos")
    .remove([video.storage_path]);

  if (storageError) {
    console.error("[videos] storage delete error:", storageError);
    // Continua para deletar o registro mesmo se o arquivo não foi encontrado
  }

  const { error: dbError } = await supabase
    .from("teacher_videos")
    .delete()
    .eq("id", videoId)
    .eq("teacher_id", user.id);

  if (dbError) return { error: dbError.message };

  revalidatePath("/professor/videos");
  return {};
}
