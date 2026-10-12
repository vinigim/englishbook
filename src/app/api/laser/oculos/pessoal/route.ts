import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { novoCodigoOculos } from "@/lib/laser/oculos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Código pessoal do óculos Even G2, do usuário logado.
 *
 * GET    → o código atual (ou null)
 * POST   → gera um código novo; o anterior para de funcionar
 * DELETE → corta o acesso
 *
 * A RLS (dono + lux_staff) decide quem pode.
 */
const TABELA = "laser_oculos_pessoal";
const MIGRACAO = "Rode a migração 0025_laser_oculos_pessoal.sql no Supabase.";

async function usuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function falhaDeBanco(acao: string, message: string) {
  console.error(`[laser-oculos-pessoal] falha ao ${acao}`, message);
  const faltaMigracao = message.includes(TABELA);
  return NextResponse.json(
    { error: faltaMigracao ? "migration_missing" : "db_error", message: faltaMigracao ? MIGRACAO : undefined },
    { status: 500 },
  );
}

export async function GET() {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from(TABELA)
    .select("codigo, ultimo_acesso_em")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return falhaDeBanco("ler", error.message);
  return NextResponse.json({
    codigo: data?.codigo ?? null,
    ultimoAcessoEm: data?.ultimo_acesso_em ?? null,
  });
}

export async function POST() {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // O unique do banco garante que não repete; colisão em 31⁸ é improvável,
  // uma segunda tentativa resolve.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const codigo = novoCodigoOculos();
    const { error } = await supabase.from(TABELA).upsert(
      {
        user_id: user.id,
        codigo,
        criado_em: new Date().toISOString(),
        ultimo_acesso_em: null,
      },
      { onConflict: "user_id" },
    );
    if (!error) return NextResponse.json({ codigo, ultimoAcessoEm: null });
    if (!/duplicate key/.test(error.message)) return falhaDeBanco("gerar", error.message);
  }
  return NextResponse.json({ error: "db_error" }, { status: 500 });
}

export async function DELETE() {
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from(TABELA).delete().eq("user_id", user.id);
  if (error) return falhaDeBanco("apagar", error.message);
  return NextResponse.json({ codigo: null, ultimoAcessoEm: null });
}
