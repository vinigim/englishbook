"use server";

import { createClient } from "@/lib/supabase/server";

export type VipActionResult = { error?: string };

export async function setVipAction(
  studentId: string,
  makeVip: boolean
): Promise<VipActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Sessão expirada." };

  if (makeVip) {
    const { error } = await supabase
      .from("teacher_student_vip")
      .upsert({ teacher_id: user.id, student_id: studentId });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("teacher_student_vip")
      .delete()
      .eq("teacher_id", user.id)
      .eq("student_id", studentId);
    if (error) return { error: error.message };
  }

  return {};
}
