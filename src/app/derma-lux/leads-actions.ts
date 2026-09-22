"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { analyzeLead } from "@/lib/ai/lead-analysis";
import { loadAnalysisInput, loadEquipment } from "@/lib/ai/load-input";
import {
  EFFECTIVE_TEMPERATURES,
  LEAD_STATUSES,
  type RecommendedAction,
} from "@/lib/leads/taxonomy";

export type ActionResult = { ok: boolean; error?: string };

async function requireSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return supabase;
}

function revalidateLead(id: string) {
  revalidatePath("/derma-lux/leads");
  revalidatePath(`/derma-lux/leads/${id}`);
}

const idSchema = z.string().uuid("ID inválido");

// ============================================================================
//  Análise
// ============================================================================

/**
 * Reanalisa um lead.
 *
 * `force` ignora o cache por hash — é o que o botão "Reanalisar" faz quando o
 * dono discorda da leitura. `gerarRascunho` força a redação mesmo num lead
 * frio, que é o botão "Gerar mensagem".
 */
export type ReanalyzeResult = ActionResult & {
  /** A IA escreveu mensagem, ou recusou? A tela precisa saber para dar retorno. */
  gerouRascunho?: boolean;
  acao?: RecommendedAction | null;
};

export async function reanalyzeLead(
  id: string,
  opts: { force?: boolean; gerarRascunho?: boolean } = {},
): Promise<ReanalyzeResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  if (!idSchema.safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }

  if (!isAiConfigured()) {
    return {
      ok: false,
      error: "ANTHROPIC_API_KEY não configurada — a análise não pode rodar.",
    };
  }

  try {
    const admin = createAdminClient();
    const equipment = await loadEquipment(admin);
    const input = await loadAnalysisInput(admin, id, equipment);

    if (!input) return { ok: false, error: "Lead não encontrado." };

    const resultado = await analyzeLead(admin, input, {
      force: opts.force ?? true,
      forceDraft: opts.gerarRascunho ?? true,
    });

    revalidateLead(id);

    // Recusar a escrever é um desfecho legítimo — "aguardar" e "descartar"
    // devolvem draft_message nulo de propósito. Sem dizer isso à tela, o
    // clique termina em silêncio e parece que o botão não fez nada.
    if (resultado.status === "analyzed") {
      return {
        ok: true,
        gerouRascunho: Boolean(resultado.record.draft_message),
        acao: resultado.record.recommended_action,
      };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha na análise.";
    console.error("[leads-actions] reanalyzeLead:", msg);
    return { ok: false, error: msg };
  }
}

// ============================================================================
//  Edição manual do lead
// ============================================================================

/**
 * Marca a situação à mão, ou devolve o lead para a derivação da agenda.
 *
 * `null` limpa o rótulo — e limpar NÃO significa "novo": significa "deduza do
 * fato". Quem alugou há pouco volta a ser cliente sozinho, sem ninguém manter
 * isso à mão em centenas de leads.
 */
const statusSchema = z.enum(LEAD_STATUSES).nullable();

export async function updateLeadStatus(
  id: string,
  status: string | null,
): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  if (!idSchema.safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }

  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Situação inválida." };

  const { error } = await supabase
    .from("wa_leads")
    .update({ status: parsed.data })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateLead(id);
  return { ok: true };
}

/**
 * Marca a temperatura à mão, ou devolve o lead para a leitura da IA.
 *
 * `null` limpa a marcação — a tela volta a exibir o que o modelo concluiu.
 *
 * NÃO toca em wa_lead_analyses: aquilo é o registro versionado do que a IA
 * disse, e sobrescrever falsificaria o histórico além de sumir na próxima
 * reanálise. A opinião do dono mora no lead, ao lado.
 *
 * Também não marca needs_analysis: discordar da temperatura não torna a
 * análise obsoleta — o resumo, as objeções e o rascunho seguem valendo.
 */
const temperaturaSchema = z.enum(EFFECTIVE_TEMPERATURES).nullable();

export async function updateLeadTemperature(
  id: string,
  temperatura: string | null,
): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  if (!idSchema.safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }

  const parsed = temperaturaSchema.safeParse(temperatura);
  if (!parsed.success) {
    return { ok: false, error: "Temperatura inválida." };
  }

  const { error } = await supabase
    .from("wa_leads")
    .update({ temperature_manual: parsed.data })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateLead(id);
  return { ok: true };
}

const detailsSchema = z.object({
  clinic_name: z.string().trim().max(200).nullish(),
  specialty: z.string().trim().max(120).nullish(),
  city: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(5000).nullish(),
});

export async function updateLeadDetails(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  if (!idSchema.safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }

  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { error } = await supabase
    .from("wa_leads")
    .update({
      clinic_name: parsed.data.clinic_name || null,
      specialty: parsed.data.specialty || null,
      city: parsed.data.city || null,
      notes: parsed.data.notes || null,
      // Esses campos entram no contexto da IA, então a análise vigente ficou
      // desatualizada no momento em que eles mudaram.
      needs_analysis: true,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateLead(id);
  return { ok: true };
}

export async function archiveLead(id: string): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  if (!idSchema.safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }

  const { error } = await supabase
    .from("wa_leads")
    .update({ archived: true })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/derma-lux/leads");
  return { ok: true };
}

/**
 * Registra que o rascunho foi copiado.
 *
 * Serve de trilha do que efetivamente virou mensagem — e é o gancho por onde
 * o envio pelo painel entra na v2, trocando channel para 'api'.
 */
export async function registerDraftCopied(
  leadId: string,
  analysisId: string,
  body: string,
): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  if (!idSchema.safeParse(leadId).success || !idSchema.safeParse(analysisId).success) {
    return { ok: false, error: "ID inválido." };
  }
  if (!body.trim()) return { ok: false, error: "Mensagem vazia." };

  const { error } = await supabase.from("wa_outbound").insert({
    lead_id: leadId,
    analysis_id: analysisId,
    body: body.slice(0, 5000),
    channel: "manual",
    status: "copiado",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
