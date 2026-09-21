import { createClient } from "@/lib/supabase/server";
import { priorityScore } from "./leads-shared";
import type {
  Lead,
  LeadAnalysis,
  LeadDetail,
  LeadInboxRow,
  LeadRental,
  WaMessage,
} from "./leads-types";

/** Colunas da análise que a lista precisa (evita trazer raw_output à toa). */
const ANALYSIS_COLS =
  "id, lead_id, version, content_hash, prompt_version, stage, temperature, intent, summary, objections, equipment_interest, equip_id, specialty, days_since_last_contact, is_existing_customer, recommended_action, draft_message, rationale, confidence, priority_score, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, created_at";

const MESSAGE_COLS =
  "id, lead_id, provider, provider_message_id, chat_id, direction, message_type, body, caption, media_url, media_mime, sent_at";

/**
 * Teto de leads carregados na caixa de entrada.
 *
 * Os filtros e a busca da tela rodam sobre o que foi carregado, então um teto
 * baixo não "esconde" leads: ele os torna inalcançáveis, inclusive pela busca.
 * Por isso o número é alto o bastante para caber a carteira inteira, e a tela
 * avisa quando esbarra nele em vez de omitir em silêncio.
 */
export const INBOX_LIMIT = 1000;

/**
 * Caixa de entrada: leads + a análise mais recente de cada um + a última
 * mensagem, ordenados por prioridade.
 *
 * O Postgres não tem "distinct on" exposto pelo supabase-js, então buscamos as
 * análises dos leads da página e reduzimos em memória. O volume aqui é de
 * centenas de leads, não de milhões — não vale a complexidade de uma view.
 */
export async function getLeadsInbox(
  limit = INBOX_LIMIT,
): Promise<LeadInboxRow[]> {
  const supabase = await createClient();

  const { data: leadsData, error: leadsErr } = await supabase
    .from("wa_leads")
    .select("*")
    .eq("archived", false)
    // Lead vindo de planilha não tem mensagem, então `last_message_at` é nulo
    // para todos eles. Sem o desempate por `created_at` o banco devolveria um
    // subconjunto arbitrário quando o teto fosse atingido.
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (leadsErr || !leadsData || leadsData.length === 0) return [];

  const leads = leadsData as Lead[];
  const ids = leads.map((l) => l.id);

  const [analysesRes, messagesRes] = await Promise.all([
    supabase
      .from("wa_lead_analyses")
      .select(ANALYSIS_COLS)
      .in("lead_id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("wa_messages")
      .select(MESSAGE_COLS)
      .in("lead_id", ids)
      .order("sent_at", { ascending: false }),
  ]);

  // Primeira ocorrência vence: as duas queries já vêm em ordem decrescente.
  const latestAnalysis = new Map<string, LeadAnalysis>();
  for (const a of (analysesRes.data ?? []) as LeadAnalysis[]) {
    if (!latestAnalysis.has(a.lead_id)) latestAnalysis.set(a.lead_id, a);
  }

  const latestMessage = new Map<string, WaMessage>();
  for (const m of (messagesRes.data ?? []) as WaMessage[]) {
    if (!latestMessage.has(m.lead_id)) latestMessage.set(m.lead_id, m);
  }

  const rows: LeadInboxRow[] = leads.map((lead) => {
    const analysis = latestAnalysis.get(lead.id) ?? null;
    const msg = latestMessage.get(lead.id) ?? null;
    return {
      lead,
      analysis,
      lastMessage: msg
        ? {
            body: msg.body,
            direction: msg.direction,
            message_type: msg.message_type,
            sent_at: msg.sent_at,
          }
        : null,
      priority: priorityScore(lead, analysis),
    };
  });

  rows.sort((a, b) => b.priority - a.priority);
  return rows;
}

export async function getLeadDetail(
  id: string,
  messageLimit = 300,
): Promise<LeadDetail | null> {
  const supabase = await createClient();

  const { data: leadData } = await supabase
    .from("wa_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!leadData) return null;
  const lead = leadData as Lead;

  const [messagesRes, analysisRes, rentalsRes] = await Promise.all([
    supabase
      .from("wa_messages")
      .select(MESSAGE_COLS)
      .eq("lead_id", id)
      .order("sent_at", { ascending: false })
      .limit(messageLimit),
    supabase
      .from("wa_lead_analyses")
      .select(ANALYSIS_COLS)
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("rentals")
      .select("id, date, price, specialty, notes, equipment:equip_id (name)")
      .eq("wa_lead_id", id)
      .order("date", { ascending: false }),
  ]);

  // Vieram em ordem decrescente para respeitar o limit; a tela quer cronológico.
  const messages = ((messagesRes.data ?? []) as WaMessage[]).slice().reverse();

  type RawRental = {
    id: string;
    date: string;
    price: number | string | null;
    specialty: string | null;
    notes: string | null;
    equipment: { name: string } | { name: string }[] | null;
  };

  const rentals: LeadRental[] = ((rentalsRes.data ?? []) as RawRental[]).map(
    (r) => {
      const equip = Array.isArray(r.equipment) ? r.equipment[0] : r.equipment;
      return {
        id: r.id,
        date: r.date,
        equipmentName: equip?.name ?? null,
        price: r.price != null ? Number(r.price) : null,
        specialty: r.specialty ?? null,
        notes: r.notes ?? null,
      };
    },
  );

  return {
    lead,
    messages,
    analysis: (analysisRes.data as LeadAnalysis | null) ?? null,
    rentals,
  };
}

/**
 * Total de leads ativos, contado no banco.
 *
 * O cabeçalho mostrava `rows.length`, que é o tamanho da página carregada —
 * com 379 leads e teto de 200, ele anunciava "200 leads". Número errado, e que
 * escondia o fato de o resto estar inalcançável.
 */
export async function countLeads(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("wa_leads")
    .select("id", { count: "exact", head: true })
    .eq("archived", false);
  return count ?? 0;
}

/** Quantos leads estão esperando análise — mostrado no topo da caixa de entrada. */
export async function countPendingAnalysis(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("wa_leads")
    .select("id", { count: "exact", head: true })
    .eq("needs_analysis", true)
    .eq("archived", false);
  return count ?? 0;
}

/** Gasto acumulado com a IA, para o dono não ser surpreendido pela fatura. */
export async function getAnalysisSpend(): Promise<{
  total: number;
  count: number;
}> {
  const supabase = await createClient();
  const { data } = await supabase.from("wa_lead_analyses").select("cost_usd");
  const rows = (data ?? []) as { cost_usd: number | string | null }[];
  const total = rows.reduce((acc, r) => acc + Number(r.cost_usd ?? 0), 0);
  return { total, count: rows.length };
}
