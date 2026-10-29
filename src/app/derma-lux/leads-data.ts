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
 * A carga pagina de `PAGINA` em `PAGINA` (o PostgREST corta cada resposta em
 * 1000 linhas), e este teto é só a proteção contra uma página pesada demais:
 * perto dele, a hora é de levar busca e filtros para o banco. A tela avisa
 * quando esbarra nele em vez de omitir em silêncio.
 */
export const INBOX_LIMIT = 5000;

/** Tamanho da página do PostgREST: acima disso ele corta em silêncio. */
const PAGINA = 1000;

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

  const leads: Lead[] = [];
  for (let de = 0; de < limit; de += PAGINA) {
    const ate = Math.min(de + PAGINA, limit) - 1;
    const { data, error } = await supabase
      .from("wa_leads")
      .select("*")
      .eq("archived", false)
      // Lead vindo de planilha não tem mensagem, então `last_message_at` é nulo
      // para todos eles. O desempate por `created_at` e `id` deixa a ordem
      // estável, senão uma página repetiria ou pularia leads da anterior.
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(de, ate);
    // Página que falha no meio derruba a carga inteira, como antes: uma lista
    // pela metade pareceria completa.
    if (error) return [];
    leads.push(...((data ?? []) as Lead[]));
    if (!data || data.length < ate - de + 1) break;
  }

  if (leads.length === 0) return [];

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

/**
 * Perfil médio de tokens de uma análise que gerou mensagem.
 *
 * Serve para o seletor de modelo mostrar um preço em dólares, e não em dólares
 * por milhão de tokens — que não ajuda ninguém a decidir nada.
 *
 * A média sai das análises que REALMENTE escreveram rascunho: uma triagem seca
 * gasta uma fração disso, e misturar as duas daria um número otimista demais.
 *
 * Os tokens gravados somam triagem + redação, e a estimativa cobra tudo pelo
 * preço do modelo escolhido. Isso superestima — na prática a triagem continua
 * no Haiku —, e é o lado certo para errar num número que decide gasto.
 *
 * Devolve `null` quando ainda não há histórico; aí a tela mostra só o preço
 * por milhão, sem inventar média.
 */
export async function getDraftTokenProfile(): Promise<{
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_lead_analyses")
    .select("input_tokens, output_tokens, cache_read_tokens")
    .not("draft_message", "is", null)
    .order("created_at", { ascending: false })
    // As últimas 200 bastam para uma média, e acompanham mudanças de prompt em
    // vez de arrastar para sempre o custo das primeiras análises.
    .limit(200);

  const linhas = (data ?? []) as {
    input_tokens: number | null;
    output_tokens: number | null;
    cache_read_tokens: number | null;
  }[];

  if (linhas.length === 0) return null;

  const soma = linhas.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + (r.input_tokens ?? 0),
      outputTokens: acc.outputTokens + (r.output_tokens ?? 0),
      cacheReadTokens: acc.cacheReadTokens + (r.cache_read_tokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
  );

  return {
    inputTokens: Math.round(soma.inputTokens / linhas.length),
    outputTokens: Math.round(soma.outputTokens / linhas.length),
    cacheReadTokens: Math.round(soma.cacheReadTokens / linhas.length),
  };
}

/** Gasto acumulado com a IA, para o dono não ser surpreendido pela fatura. */
/**
 * Soma `cost_usd` de uma tabela inteira. Pagina: o PostgREST corta em 1000
 * linhas em silêncio, e o painel chegou a mostrar só as primeiras mil
 * análises. Tabela ausente (migração não rodada) conta zero.
 */
async function somarCusto(
  tabela: "wa_lead_analyses" | "wa_instagram_buscas",
): Promise<{ total: number; count: number }> {
  const supabase = await createClient();
  let total = 0;
  let count = 0;
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from(tabela)
      .select("cost_usd")
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) break;
    const rows = (data ?? []) as { cost_usd: number | string | null }[];
    for (const r of rows) total += Number(r.cost_usd ?? 0);
    count += rows.length;
    if (rows.length < PAGINA) break;
  }
  return { total, count };
}

export async function getAnalysisSpend(): Promise<{
  total: number;
  count: number;
  instagram: { total: number; count: number };
}> {
  const [analises, instagram] = await Promise.all([
    somarCusto("wa_lead_analyses"),
    somarCusto("wa_instagram_buscas"),
  ]);
  return { ...analises, instagram };
}

/**
 * Todos os leads (inclusive arquivados, sem grupos) com a análise mais recente
 * e o resumo da agenda, para a planilha de exportação. Sem o teto da caixa de
 * entrada: pagina até acabar.
 */
export async function getLeadsParaExportar(): Promise<
  Pick<LeadInboxRow, "lead" | "analysis" | "rentals">[]
> {
  const supabase = await createClient();

  const leads: Lead[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("wa_leads")
      .select("*")
      .eq("is_group", false)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    leads.push(...((data ?? []) as Lead[]));
    if (!data || data.length < PAGINA) break;
  }

  const ids = leads.map((l) => l.id);
  const [analyses, rentals] = await Promise.all([
    emLotes<LeadAnalysis>(ids, (lote) =>
      supabase.from("wa_latest_analyses").select(ANALYSIS_COLS).in("lead_id", lote),
    ),
    emLotes<LeadRentals>(ids, (lote) =>
      supabase.from("wa_lead_rentals").select(RENTALS_COLS).in("lead_id", lote),
    ),
  ]);

  const analisePorLead = new Map(analyses.map((a) => [a.lead_id, a]));
  const agendaPorLead = new Map(rentals.map((r) => [r.lead_id, r]));
  return leads.map((lead) => ({
    lead,
    analysis: analisePorLead.get(lead.id) ?? null,
    rentals: agendaPorLead.get(lead.id) ?? null,
  }));
}
