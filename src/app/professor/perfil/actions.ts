"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  full_name: z.string().min(2, "Nome muito curto").max(120),
  bio: z.string().max(1000).optional(),
  hourly_price_brl: z
    .number({ coerce: true })
    .min(10, "Preço mínimo R$ 10")
    .max(2000, "Preço máximo R$ 2.000"),
  active: z.boolean(),
  topic_ids: z.array(z.string().uuid()).optional(),
});

export type ProfileState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function saveTeacherProfileAction(
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sessão expirada." };

  const priceRaw = formData.get("hourly_price_brl");
  const parsed = schema.safeParse({
    full_name: formData.get("full_name"),
    bio: formData.get("bio") || "",
    hourly_price_brl: priceRaw ? Number(priceRaw) : 0,
    active: formData.get("active") === "on",
    topic_ids: formData.getAll("topic_ids"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name })
    .eq("id", user.id);

  if (profileError) return { error: profileError.message };

  const { error: teacherError } = await supabase
    .from("teachers")
    .update({
      bio: parsed.data.bio || null,
      hourly_price_cents: Math.round(parsed.data.hourly_price_brl * 100),
      active: parsed.data.active,
    })
    .eq("id", user.id);

  if (teacherError) return { error: teacherError.message };

  // Substitui todos os tópicos do professor
  const { error: deleteError } = await supabase
    .from("teacher_topics")
    .delete()
    .eq("teacher_id", user.id);

  if (deleteError) return { error: deleteError.message };

  const topicIds = parsed.data.topic_ids ?? [];
  if (topicIds.length > 0) {
    const { error: insertError } = await supabase
      .from("teacher_topics")
      .insert(topicIds.map((id) => ({ teacher_id: user.id, topic_id: id })));

    if (insertError) return { error: insertError.message };
  }

  revalidatePath("/professor/perfil");
  revalidatePath("/professor/dashboard");
  revalidatePath("/aluno/agendar");
  return { ok: true };
}
