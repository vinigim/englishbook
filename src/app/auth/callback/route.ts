import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Destino dos links que o Supabase manda por e-mail.
 *
 * Troca o `?code` por uma sessão em cookie e leva para a agenda. Na prática,
 * é o que faz funcionar a recuperação de senha disparada pelo painel do
 * Supabase (Authentication → Users → Send password recovery) — o app não tem
 * tela própria para pedir a troca.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/derma-lux/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/derma-lux/login?error=${encodeURIComponent(error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}/derma-lux`);
}
