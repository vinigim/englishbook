import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { novoCodigoOculos } from "@/lib/laser/oculos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Código do óculos Even G2 de uma locação, pelo painel.
 *
 * GET ?rentalId=  → o código atual (ou null)
 * POST {rentalId} → gera um código novo; o anterior para de funcionar
 * DELETE ?rentalId= → corta o acesso
 *
 * Tudo pelo cliente do usuário: a RLS (lux_staff) decide quem pode.
 */
const TABELA = "laser_oculos_acessos";
const uuid = z.string().uuid();

const MIGRACAO =
  "Rode a migração 0024_laser_oculos.sql no Supabase para usar o óculos.";

async function usuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function falhaDeBanco(acao: string, message: string) {
  console.error(`[laser-oculos] falha ao ${acao}`, message);
  const faltaMigracao = /laser_oculos_acessos/.test(message);
  return NextResponse.json(
    { error: faltaMigracao ? "migration_missing" : "db_error", message: faltaMigracao ? MIGRACAO : undefined },
    { status: 500 },
  );
}

export async function GET(request: NextRequest) {
  const rentalId = request.nextUrl.searchParams.get("rentalId") ?? "";
  if (!uuid.safeParse(rentalId).success) {
    return NextResponse.json({ error: "invalid_rental" }, { status: 400 });
  }
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from(TABELA)
    .select("codigo, criado_em, ultimo_acesso_em")
    .eq("rental_id", rentalId)
    .maybeSingle();
  if (error) return falhaDeBanco("ler", error.message);
  return NextResponse.json({
    codigo: data?.codigo ?? null,
    ultimoAcessoEm: data?.ultimo_acesso_em ?? null,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = z.object({ rentalId: uuid }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_rental" }, { status: 400 });
  }
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Colisão em 31⁸ é improvável, mas o unique do banco é quem garante; uma
  // segunda tentativa resolve.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const codigo = novoCodigoOculos();
    const { error } = await supabase.from(TABELA).upsert(
      {
        rental_id: parsed.data.rentalId,
        codigo,
        criado_em: new Date().toISOString(),
        criado_por: user.id,
        ultimo_acesso_em: null,
      },
      { onConflict: "rental_id" },
    );
    if (!error) return NextResponse.json({ codigo, ultimoAcessoEm: null });
    if (!/laser_oculos_acessos_codigo_key|duplicate key/.test(error.message)) {
      return falhaDeBanco("gerar", error.message);
    }
  }
  return NextResponse.json({ error: "db_error" }, { status: 500 });
}

export async function DELETE(request: NextRequest) {
  const rentalId = request.nextUrl.searchParams.get("rentalId") ?? "";
  if (!uuid.safeParse(rentalId).success) {
    return NextResponse.json({ error: "invalid_rental" }, { status: 400 });
  }
  const { supabase, user } = await usuario();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from(TABELA).delete().eq("rental_id", rentalId);
  if (error) return falhaDeBanco("apagar", error.message);
  return NextResponse.json({ codigo: null, ultimoAcessoEm: null });
}
