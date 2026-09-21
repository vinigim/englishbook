import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

/**
 * Renova a sessão do Supabase a cada requisição.
 *
 * É só isso que o middleware faz. A proteção das telas acontece no layout de
 * src/app/derma-lux/(app)/layout.tsx, que redireciona para o login quando não
 * há usuário.
 *
 * Mesmo sem guardar rota nenhuma, esta função precisa continuar rodando: é ela
 * que reescreve os cookies de autenticação antes de expirarem. Sem isso a
 * agenda desloga sozinha no meio do uso.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: CookieOptions;
        }[]
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // A chamada em si é o que dispara a renovação do token.
  await supabase.auth.getUser();

  return response;
}
