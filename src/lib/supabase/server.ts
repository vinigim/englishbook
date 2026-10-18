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

/** Usuário logado ou null. Use em Server Actions e Route Handlers. */
export async function usuarioAtual() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}
