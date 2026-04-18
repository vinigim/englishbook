"use server";

import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

export type ForgotState = {
  ok?: boolean;
  error?: string;
};

export async function requestPasswordResetAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "E-mail inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  // Retornamos sempre ok=true (não revelamos se o e-mail existe).
  return { ok: true };
}
