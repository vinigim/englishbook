import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { analyzeLead } from "@/lib/ai/lead-analysis";
import { loadAnalysisInput, loadEquipment } from "@/lib/ai/load-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Analisa em lote os leads marcados como pendentes.
 *
 * Roda em série de propósito. Além de ser mais gentil com o limite de
 * requisições, manter as chamadas próximas no tempo faz o cache do prompt
 * estável valer: só a primeira paga o bloco de ~1,5k tokens por inteiro.
 */

const LIMITE_MS = 250_000;

const bodySchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  /** Analisa estes leads especificamente, ignorando a fila. */
  leadIds: z.array(z.string().uuid()).max(100).optional(),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error: "ai_not_configured",
        message: "Configure ANTHROPIC_API_KEY para gerar as análises.",
      },
      { status: 500 },
    );
  }

  let body: unknown = {};
  try {
    const texto = await request.text();
    if (texto.trim()) body = JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { limit = 25, leadIds, force = false } = parsed.data;

  const admin = createAdminClient();
  const inicio = Date.now();

  // Quais leads analisar.
  let alvos: string[];
  if (leadIds && leadIds.length > 0) {
    alvos = leadIds;
  } else {
    const { data, error } = await admin
      .from("wa_leads")
      .select("id")
      .eq("needs_analysis", true)
      .eq("archived", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.error("[leads-analyze] falha ao listar pendentes:", error);
      return NextResponse.json({ error: "query_failed" }, { status: 500 });
    }
    alvos = ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  if (alvos.length === 0) {
    return NextResponse.json({
      ok: true,
      analisados: 0,
      reaproveitados: 0,
      falhas: 0,
      custoUsd: 0,
    });
  }

  const equipment = await loadEquipment(admin);

  let analisados = 0;
  let reaproveitados = 0;
  let restantes = 0;
  let custoUsd = 0;
  const falhas: { leadId: string; erro: string }[] = [];

  for (let i = 0; i < alvos.length; i++) {
    if (Date.now() - inicio > LIMITE_MS) {
      restantes = alvos.length - i;
      break;
    }

    const leadId = alvos[i];
    try {
      const input = await loadAnalysisInput(admin, leadId, equipment);
      if (!input) continue;

      const resultado = await analyzeLead(admin, input, { force });

      if (resultado.status === "analyzed") {
        analisados += 1;
        custoUsd += resultado.record.cost_usd;
      } else if (resultado.status === "cached") {
        reaproveitados += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "falha";
      console.error(`[leads-analyze] lead ${leadId}:`, msg);
      falhas.push({ leadId, erro: msg });
    }
  }

  console.log(
    `[leads-analyze] ${analisados} analisado(s), ${reaproveitados} reaproveitado(s), ${falhas.length} falha(s), US$ ${custoUsd.toFixed(4)}`,
  );

  return NextResponse.json({
    ok: true,
    analisados,
    reaproveitados,
    falhas: falhas.length,
    detalheFalhas: falhas.slice(0, 5),
    restantes,
    custoUsd: Math.round(custoUsd * 1_000_000) / 1_000_000,
  });
}
