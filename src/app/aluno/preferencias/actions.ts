"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  daily_availability_email: z.boolean(),
  preferred_teacher_ids: z.array(z.string().uuid()).max(50),
});

export type PreferencesState = {
  ok?: boolean;
  error?: string;
  savedAt?: number;
};

export async function savePreferencesAction(
  _prev: PreferencesState,
  formData: FormData
): Promise<PreferencesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sessão expirada. Faça login de novo." };
  }

  // FormData → objeto
  const dailyEmail = formData.get("daily_availability_email") === "on";
  const preferredIds = formData.getAll("preferred_teacher_ids").map(String);

  const parsed = schema.safeParse({
    daily_availability_email: dailyEmail,
    preferred_teacher_ids: preferredIds,
  });

  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  const { error } = await supabase
    .from("students")
    .update({
      daily_availability_email: parsed.data.daily_availability_email,
      preferred_teacher_ids: parsed.data.preferred_teacher_ids,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/aluno/preferencias");
  return { ok: true, savedAt: Date.now() };
}
