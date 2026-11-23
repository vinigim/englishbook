import type { SupabaseClient } from "@supabase/supabase-js";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { analyzeLead } from "@/lib/ai/lead-analysis";
import { loadAnalysisInput, loadEquipment } from "@/lib/ai/load-input";
import { getLeadsParaExportar } from "@/app/derma-lux/leads-data";
import {
  hojeSP,
  montarFila,
  SECOES,
  type FilaDoDia,
} from "@/app/derma-lux/fila-do-dia";

/**
 * Monta e grava a Fila do dia (0032). Chamado pelo cron das 6h e pelo botão
 * "Montar agora" do Radar. Sempre com a service role: o cron não tem sessão.
 *
 * Também deixa a IA em dia com os leads DA FILA que estão pendentes de
 * análise — e só com eles: são poucos por dia, e é a fila que o dono vai
 * abrir. A análise roda como no botão do Radar (triagem sempre; redação só
 * para quente/morno), então o custo é o de sempre. Teto de tempo abaixo do
 * corte da Vercel; o que não couber fica para o botão "Analisar pendentes".
 */

const LIMITE_ANALISE_MS = 35_000;

export type ResultadoFila = {
  fila: FilaDoDia;
  analisados: number;
  custoUsd: number;
  pendentesNaFila: number;
};

export async function gerarFilaDoDia(
  admin: SupabaseClient,
  origem: "cron" | "manual",
): Promise<ResultadoFila> {
  const inicio = Date.now();
  const agora = new Date();

  const linhas = (await getLeadsParaExportar(admin)).filter(
    (l) => !l.lead.archived && !l.lead.is_group,
  );

  const hoje = hojeSP(agora);
  const em7 = hojeSP(new Date(agora.getTime() + 7 * 86_400_000));
  const { count: locacoes7d, error: erroLoc } = await admin
    .from("rentals")
    .select("id", { count: "exact", head: true })
    .gte("date", hoje)
    .lte("date", em7);
  if (erroLoc) throw new Error(`locações: ${erroLoc.message}`);

  const fila = montarFila(linhas, locacoes7d ?? 0, agora);

  // Análise dos pendentes que estão na fila, na ordem das seções.
  const porId = new Map(linhas.map((l) => [l.lead.id, l]));
  const pendentes = SECOES.flatMap((s) => fila.secoes[s])
    .map((i) => porId.get(i.leadId))
    .filter((l) => l && (l.lead.needs_analysis || !l.analysis))
    .map((l) => l!.lead.id);

  let analisados = 0;
  let custoUsd = 0;
  let feitos = 0;
  if (pendentes.length > 0 && isAiConfigured()) {
    const equipment = await loadEquipment(admin);
    for (const leadId of pendentes) {
      if (Date.now() - inicio > LIMITE_ANALISE_MS) break;
      feitos += 1;
      try {
        const input = await loadAnalysisInput(admin, leadId, equipment);
        if (!input) continue;
        const r = await analyzeLead(admin, input);
        if (r.status === "analyzed") {
          analisados += 1;
          custoUsd += r.record.cost_usd;
        }
      } catch (e) {
        console.error(`[fila-do-dia] análise ${leadId}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  const { error } = await admin.from("fila_do_dia").upsert(
    {
      dia: fila.dia,
      gerada_em: fila.gerada_em,
      secoes: fila.secoes,
      locacoes_7d: fila.locacoes_7d,
      analisados,
      custo_usd: Math.round(custoUsd * 1_000_000) / 1_000_000,
      origem,
    },
    { onConflict: "dia" },
  );
  if (error) {
    throw new Error(
      /fila_do_dia/.test(error.message)
        ? "Falta rodar a migração 0032 no Supabase."
        : error.message,
    );
  }

  return { fila, analisados, custoUsd, pendentesNaFila: pendentes.length - feitos };
}
