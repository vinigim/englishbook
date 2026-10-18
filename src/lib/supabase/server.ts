import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (lista) => {
          try {
            for (const { name, value, options } of lista) cookieStore.set(name, value, options);
          } catch {
            // Server Component: o middleware cuida de renovar o cookie.
          }
        },
      },
    },
  );
}

/**
 * E-mails que podem usar o radar (EMAILS_PERMITIDOS, separados por vírgula).
 * Importa quando o projeto Supabase é compartilhado com outro sistema: qualquer
 * conta de lá conseguiria entrar aqui e gastar a sua chave da Anthropic.
 * Sem a variável, qualquer usuário autenticado entra.
 */
export function emailPermitido(email: string | undefined): boolean {
  const lista = (process.env.EMAILS_PERMITIDOS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.length === 0 || (!!email && lista.includes(email.toLowerCase()));
}

/** Usuário logado e permitido, ou null. Use em layouts, Server Actions e Route Handlers. */
export async function usuarioAtual() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user && emailPermitido(data.user.email) ? data.user : null;
  return { supabase, user, bloqueado: Boolean(data.user && !user) };
}
