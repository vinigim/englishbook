import { createClient } from "@/lib/supabase/server";
import { priorityScore } from "./leads-shared";
import type {
  Lead,
  LeadAnalysis,
  LeadDetail,
  LeadInboxRow,
  LeadRental,
  LeadRentals,
  WaMessage,
} from "./leads-types";

/** Colunas da análise que a lista precisa (evita trazer raw_output à toa). */
const ANALYSIS_COLS =
  "id, lead_id, version, content_hash, prompt_version, stage, temperature, intent, summary, objections, equipment_interest, equip_id, specialty, days_since_last_contact, is_existing_customer, recommended_action, draft_message, rationale, confidence, priority_score, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, created_at";

const RENTALS_COLS = "lead_id, total, ultima, primeira, total_brl";

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
 * Quantos ids cabem num filtro `.in(...)` por requisição.
 *
 * O supabase-js manda o filtro na QUERY STRING. Cada UUID custa ~37 caracteres,
 * então algumas centenas de ids estouram o limite de tamanho da URL do gateway
 * — e a requisição falha inteira. Com 665 leads isso deu ~25 mil caracteres e
 * derrubou a caixa de entrada: a tela passou a dizer que ninguém tinha análise
 * nem conversa, porque as duas consultas falhavam.
 *
 * 150 ids ≈ 5,5 mil caracteres, bem dentro de qualquer limite razoável.
 */
const ID_CHUNK = 150;

/** Roda a mesma consulta em lotes de ids e concatena. Erro em qualquer lote derruba tudo. */
async function emLotes<T>(
  ids: string[],
  busca: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    lotes.push(ids.slice(i, i + ID_CHUNK));
  }

  const resultados = await Promise.all(lotes.map(busca));
  const saida: T[] = [];

  for (const r of resultados) {
    // Antes isto era `r.data ?? []`, e uma consulta que falhava virava lista
    // vazia — a tela concluía "não existe" em vez de "não consegui ler".
    if (r.error) throw new Error(r.error.message);
    if (r.data) saida.push(...r.data);
  }

  return saida;
}

/**
 * Caixa de entrada: leads + a análise mais recente de cada um + a última
 * mensagem, ordenados por prioridade.
 *
 * As views `wa_latest_analyses` e `wa_latest_messages` (migração 0011) fazem o
 * "mais recente por lead" no banco. Antes isso era feito trazendo TODAS as
 * análises e TODAS as mensagens e reduzindo em memória, o que batia no teto de
 * 1000 linhas do PostgREST e truncava em silêncio.
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

  const [analyses, messages, rentals] = await Promise.all([
    emLotes<LeadAnalysis>(ids, (lote) =>
      supabase.from("wa_latest_analyses").select(ANALYSIS_COLS).in("lead_id", lote),
    ),
    emLotes<WaMessage>(ids, (lote) =>
      supabase.from("wa_latest_messages").select(MESSAGE_COLS).in("lead_id", lote),
    ),
    // A agenda é quem diz se o lead já foi cliente (view da 0014).
    emLotes<LeadRentals>(ids, (lote) =>
      supabase.from("wa_lead_rentals").select(RENTALS_COLS).in("lead_id", lote),
    ),
  ]);

  // As views já garantem uma linha por lead — nada a reduzir aqui.
  const latestAnalysis = new Map<string, LeadAnalysis>();
  for (const a of analyses) latestAnalysis.set(a.lead_id, a);

  const latestMessage = new Map<string, WaMessage>();
  for (const m of messages) latestMessage.set(m.lead_id, m);

  const porLead = new Map<string, LeadRentals>();
  for (const r of rentals) porLead.set(r.lead_id, r);

  const rows: LeadInboxRow[] = leads.map((lead) => {
    const analysis = latestAnalysis.get(lead.id) ?? null;
    const msg = latestMessage.get(lead.id) ?? null;
    return {
      lead,
      rentals: porLead.get(lead.id) ?? null,
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
