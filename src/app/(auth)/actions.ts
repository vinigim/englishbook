"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// ============================================================================
// LOGIN
// ============================================================================
const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha muito curta"),
});

export type AuthState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

export async function loginAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  // Descobre role pra redirecionar pro dashboard certo
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Falha ao recuperar usuário." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const next = (formData.get("next") as string) || null;
  if (next && (next.startsWith("/aluno") || next.startsWith("/professor"))) {
    revalidatePath(next);
    redirect(next);
  }

  revalidatePath("/", "layout");
  if (profile?.role === "professor") {
    redirect("/professor/dashboard");
  } else {
    redirect("/aluno/dashboard");
  }
}

// ============================================================================
// SIGNUP
// ============================================================================
const signupSchema = z.object({
  full_name: z.string().min(2, "Nome muito curto"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha precisa ter pelo menos 6 caracteres"),
  role: z.enum(["aluno", "professor"]),
});

export async function signupAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.full_name,
        role: parsed.data.role,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      return { error: "Já existe uma conta com esse e-mail." };
    }
    return { error: error.message };
  }

  // Se o Supabase estiver com confirmação de e-mail desligada,
  // o usuário já está logado. Caso contrário, mostra "confira seu e-mail".
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    revalidatePath("/", "layout");
    if (parsed.data.role === "professor") {
      redirect("/professor/dashboard");
    } else {
      redirect("/aluno/dashboard");
    }
  }

  redirect(`/signup/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

// ============================================================================
// LOGOUT
// ============================================================================
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
