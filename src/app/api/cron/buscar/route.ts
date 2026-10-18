import { NextResponse, type NextRequest } from "next/server";
import { rodarBusca } from "@/lib/busca";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Chamado pela Vercel uma vez por dia (vercel.json), com "Authorization: Bearer $CRON_SECRET".
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: perfis, error } = await supabase.from("perfil").select("user_id").eq("busca_ativa", true);
  if (error) {
    console.error("[cron-buscar]", error.message);
    return NextResponse.json({ error: "perfil_query_failed" }, { status: 500 });
  }

  const resultados: Record<string, unknown> = {};
  for (const { user_id } of perfis ?? []) {
    try {
      resultados[user_id] = await rodarBusca(supabase, user_id, "cron");
    } catch (e) {
      console.error("[cron-buscar]", user_id, e);
      resultados[user_id] = { erro: e instanceof Error ? e.message : String(e) };
    }
  }
  return NextResponse.json({ ok: true, resultados });
}
