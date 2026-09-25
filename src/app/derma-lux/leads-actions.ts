"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { analyzeLead } from "@/lib/ai/lead-analysis";
import { loadAnalysisInput, loadEquipment } from "@/lib/ai/load-input";
import { isDraftModel } from "@/lib/ai/models";
import { toInstagramHandle } from "@/lib/leads/instagram";
import { getWhatsAppProvider } from "@/lib/whatsapp";
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
  opts: {
    force?: boolean;
    gerarRascunho?: boolean;
    /** Quem escreve a mensagem NESTA chamada. Nulo = o padrão. */
    draftModel?: string;
    /** "Gerar mensagem assim mesmo": a IA tem que devolver texto. */
    exigirMensagem?: boolean;
  } = {},
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

    // Validado contra a lista, e não repassado cru: este valor vem do
    // navegador e vira o `model` de uma chamada paga.
    const draftModel =
      opts.draftModel && isDraftModel(opts.draftModel)
        ? opts.draftModel
        : undefined;

    const resultado = await analyzeLead(admin, input, {
      force: opts.force ?? true,
      forceDraft: opts.gerarRascunho ?? true,
      exigirMensagem: opts.exigirMensagem ?? false,
      draftModel,
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

    // Pulada = a IA respondeu mas nada foi gravado. Dizer "concluída" aqui foi
    // o que escondeu, por muito tempo, reanálises pagas e jogadas fora.
    if (resultado.status === "skipped") {
      return { ok: false, error: `A análise não foi gravada: ${resultado.reason}.` };
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

/**
 * Marca (ou desmarca) que a mensagem saiu pelo direct do Instagram.
 *
 * É a única saída que o sistema não consegue enxergar sozinho: o que sai pelo
 * WhatsApp volta na sincronização e atualiza `last_outbound_at`; o Instagram
 * não volta nunca. Sem esta marcação, um lead que já recebeu mensagem fica
 * idêntico a um que nunca recebeu.
 *
 * Desmarcar apaga a data em vez de guardar um histórico: isto é o desfazer de
 * um toque errado, não um registro de auditoria.
 *
 * Marca `needs_analysis` porque muda o quadro que a IA lê — "mandei e não
 * respondeu" pede coisa diferente de "nunca falei com essa pessoa".
 *
 * Marcar também põe o lead como frio confirmado, a pedido do dono: a
 * abordagem pelo direct já foi feita, e o lead sai de "Devo responder". Por
 * cima de qualquer temperatura manual anterior, inclusive quente confirmado.
 * Desmarcar NÃO volta a temperatura: não há como saber o que havia antes, e
 * apagar a marcação poderia desfazer uma escolha que o dono fez à mão.
 */
export async function marcarInstagramEnviado(
  id: string,
  enviado: boolean,
): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  if (!idSchema.safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }

  const { error } = await supabase
    .from("wa_leads")
    .update({
      instagram_sent_at: enviado ? new Date().toISOString() : null,
      needs_analysis: true,
      ...(enviado ? { temperature_manual: "frio_confirmado" as const } : {}),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateLead(id);
  return { ok: true };
}

/**
 * Grava o Instagram do lead — hoje, o perfil que o dono escolheu entre os
 * candidatos da busca com IA.
 *
 * Passa pelo mesmo `toInstagramHandle` da importação, para a coluna guardar
 * sempre só o handle. Marca `instagram_escolhido_em`: a partir daí uma
 * planilha com outro @ não troca este (decisão do dono). O Instagram entra no contexto da IA, então a análise
 * vigente fica desatualizada.
 */
export async function definirInstagram(
  id: string,
  valor: string,
): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  if (!idSchema.safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }

  const handle = toInstagramHandle(valor);
  if (!handle) return { ok: false, error: "Esse @ não parece um perfil do Instagram." };

  // A marca faz a importação de planilha não trocar este @ depois.
  let { error } = await supabase
    .from("wa_leads")
    .update({
      instagram: handle,
      instagram_escolhido_em: new Date().toISOString(),
      needs_analysis: true,
    })
    .eq("id", id);

  // Sem a migração 0019 a coluna não existe. Salvar o @ vale mais que a
  // marca: grava sem ela (a planilha ainda poderá trocá-lo, como antes).
  if (error && /instagram_escolhido_em/.test(error.message)) {
    ({ error } = await supabase
      .from("wa_leads")
      .update({ instagram: handle, needs_analysis: true })
      .eq("id", id));
  }

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

// ============================================================================
//  Tem WhatsApp?
// ============================================================================

/** Fixo brasileiro no formato do banco: 55 + DDD + 8 dígitos começando em 2–5. */
const FIXO_BR_REGEX = "^55[0-9]{2}[2-5][0-9]{7}$";

/**
 * Por clique do "Verificar fixos". Baixo de propósito: consultar muito número
 * desconhecido de uma vez é padrão de spam para o WhatsApp — ver LEADS.md,
 * "Risco de banimento".
 */
const LOTE_VERIFICACAO = 25;

export type VerificacaoResult = ActionResult & {
  verificados?: number;
  comWhatsApp?: number;
  semWhatsApp?: number;
  /** Fixos ainda sem verificação, depois deste lote. */
  restantes?: number;
  /** Só no modo de um lead: a resposta para ele. */
  existe?: boolean;
};

const verificacaoSchema = z.object({ id: z.string().uuid("ID inválido").optional() });

function erroDeVerificacao(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("whatsapp_existe") || msg.includes("whatsapp_verificado_em")) {
    return "Falta rodar a migração 0020_whatsapp_verificado.sql no Supabase.";
  }
  return msg;
}

/**
 * Pergunta ao WhatsApp se o telefone tem conta e grava a resposta.
 *
 * Com `id`: verifica aquele lead, mesmo que já verificado (é o "Verificar de
 * novo" da ficha). Sem `id`: o próximo lote de fixos nunca verificados e sem
 * conversa — conversa sincronizada já prova que a conta existe.
 *
 * Número que o provedor não respondeu fica como estava: gravar "não tem" por
 * falta de resposta esconderia o botão do WhatsApp de quem tem.
 */
export async function verificarWhatsApp(
  input: { id?: string } = {},
): Promise<VerificacaoResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const parsed = verificacaoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  const { id } = parsed.data;

  const provider = getWhatsAppProvider();
  if (!provider.checkNumbers) {
    return { ok: false, error: "O provedor de WhatsApp não sabe verificar números." };
  }

  const pendentes = () =>
    supabase
      .from("wa_leads")
      .select("id, phone_e164", { count: "exact" })
      .eq("archived", false)
      .eq("is_group", false)
      .is("whatsapp_verificado_em", null)
      .is("wa_jid", null)
      .is("last_inbound_at", null)
      .is("last_outbound_at", null)
      .filter("phone_e164", "match", FIXO_BR_REGEX);

  try {
    const { data, error } = id
      ? await supabase.from("wa_leads").select("id, phone_e164").eq("id", id)
      : await pendentes().order("created_at").limit(LOTE_VERIFICACAO);
    if (error) throw new Error(error.message);

    const leads = (data ?? []).filter((l) => l.phone_e164);
    if (id && leads.length === 0) return { ok: false, error: "Lead não encontrado." };

    const respostas =
      leads.length > 0
        ? await provider.checkNumbers([...new Set(leads.map((l) => l.phone_e164))])
        : {};

    const agora = new Date().toISOString();
    const porResposta = { true: [] as string[], false: [] as string[] };
    for (const l of leads) {
      const existe = respostas[l.phone_e164];
      if (typeof existe === "boolean") porResposta[`${existe}`].push(l.id);
    }

    for (const existe of [true, false] as const) {
      const ids = porResposta[`${existe}`];
      if (ids.length === 0) continue;
      const { error: erroUpdate } = await supabase
        .from("wa_leads")
        .update({ whatsapp_existe: existe, whatsapp_verificado_em: agora })
        .in("id", ids);
      if (erroUpdate) throw new Error(erroUpdate.message);
    }

    const verificados = porResposta.true.length + porResposta.false.length;
    if (id && verificados === 0) {
      return { ok: false, error: "O WhatsApp não respondeu sobre este número. Tente de novo." };
    }

    let restantes = 0;
    if (!id) {
      const { count } = await pendentes().limit(1);
      restantes = count ?? 0;
    }

    if (id) revalidateLead(id);
    else revalidatePath("/derma-lux/leads");

    return {
      ok: true,
      verificados,
      comWhatsApp: porResposta.true.length,
      semWhatsApp: porResposta.false.length,
      restantes,
      existe: id ? porResposta.true.length > 0 : undefined,
    };
  } catch (err) {
    console.error("[verificar-whatsapp]", err);
    return { ok: false, error: erroDeVerificacao(err) };
  }
}
