import { NextResponse } from "next/server";
import { rodarBusca } from "@/lib/busca";
import { usuarioAtual } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Botão "Buscar agora".
export async function POST() {
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await rodarBusca(supabase, user.id, "manual"));
  } catch (e) {
    console.error("[buscar]", e);
    return NextResponse.json({ error: "busca_falhou" }, { status: 500 });
  }
}
