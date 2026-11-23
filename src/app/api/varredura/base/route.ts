import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Base mínima para a varredura de leads (`ferramentas/varredura/`), que roda
 * numa sessão agendada sem login: só o que ela precisa para não trazer de
 * volta quem já está no Radar e para trocar fixo por celular.
 *
 * Nada de conversa, análise ou observação: telefone, nome, cidade, se tem
 * WhatsApp e se já tem perfil. Mesmo assim é dado de lead, então a rota exige
 * `Authorization: Bearer <VARREDURA_TOKEN>` e, sem a variável, recusa tudo.
 */
const PAGINA = 1000;

function autorizado(request: NextRequest): boolean {
  const token = process.env.VARREDURA_TOKEN;
  if (!token || token.length < 24) return false;
  const veio = Buffer.from(request.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${token}`);
  return veio.length === esperado.length && timingSafeEqual(veio, esperado);
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }
  const admin = adminResult.admin;

  const leads: unknown[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await admin
      .from("wa_leads")
      .select(
        "id, phone_key, phone_e164, telefones_anteriores, sheet_name, display_name, clinic_name, specialty, city, uf, whatsapp_existe, instagram, perfil_url, crm, archived",
      )
      .eq("is_group", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) {
      console.error("[varredura-base]", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }
    leads.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }

  return NextResponse.json(
    { geradoEm: new Date().toISOString(), leads },
    { headers: { "Cache-Control": "no-store" } },
  );
}
