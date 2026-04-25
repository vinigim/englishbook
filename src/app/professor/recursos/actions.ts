"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const VALID_TYPES = ["blog", "youtube", "artigo", "noticia", "game", "podcast"] as const;

const schema = z.object({
  title: z.string().min(1, "Título obrigatório").max(200),
  url: z.string().url("URL inválida — inclua https://"),
  type: z.enum(VALID_TYPES, { errorMap: () => ({ message: "Tipo inválido." }) }),
  topic_id: z.string().uuid().nullable(),
  description: z.string().max(2000).optional(),
});

export type ResourceActionResult = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function createResourceAction(
  data: unknown
): Promise<ResourceActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sessão expirada." };

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const { error } = await supabase.from("teacher_resources").insert({
    teacher_id: user.id,
    topic_id: parsed.data.topic_id,
    type: parsed.data.type,
    title: parsed.data.title,
    url: parsed.data.url,
    description: parsed.data.description || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/professor/recursos");
  return {};
}

export async function deleteResourceAction(
  resourceId: string
): Promise<ResourceActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sessão expirada." };

  const { error } = await supabase
    .from("teacher_resources")
    .delete()
    .eq("id", resourceId)
    .eq("teacher_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/professor/recursos");
  return {};
}
