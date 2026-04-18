import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// O Supabase redireciona pra cá depois da confirmação de e-mail
// (ou OAuth, se habilitado). Ele troca o ?code por uma session via cookie.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // Se já foi pedido um next explícito, honra.
  if (next && (next.startsWith("/aluno") || next.startsWith("/professor"))) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // Caso contrário, manda pro dashboard do role
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "professor") {
    return NextResponse.redirect(`${origin}/professor/dashboard`);
  }
  return NextResponse.redirect(`${origin}/aluno/dashboard`);
}
