import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole, Profile } from "@/lib/types";

/**
 * Retorna o usuário autenticado + profile. Se não houver sessão ou
 * o role for diferente do esperado, redireciona.
 *
 * Uso típico em page.tsx de /aluno/*:
 *   const { user, profile } = await requireUser("aluno");
 */
export async function requireUser(expectedRole?: UserRole) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) {
    // Se chegou aqui sem profile, algo está muito errado — melhor deslogar.
    await supabase.auth.signOut();
    redirect("/login");
  }

  if (expectedRole && profile.role !== expectedRole) {
    redirect(
      profile.role === "professor"
        ? "/professor/dashboard"
        : "/aluno/dashboard"
    );
  }

  return { user, profile, supabase };
}
