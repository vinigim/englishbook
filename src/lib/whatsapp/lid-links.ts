import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vínculos LID → telefone feitos à mão (tabela wa_lid_links, migração 0017).
 *
 * Tabela ausente — migração ainda não rodada — não pode derrubar a
 * sincronização nem o webhook: devolve mapa vazio e segue como antes.
 */
export async function carregarVinculosLid(
  admin: SupabaseClient,
): Promise<Record<string, string>> {
  const { data, error } = await admin
    .from("wa_lid_links")
    .select("lid, phone_e164");

  if (error) {
    console.error("[wa-lid-links] falha ao ler vínculos:", error.message);
    return {};
  }

  const mapa: Record<string, string> = {};
  for (const r of (data ?? []) as { lid: string; phone_e164: string }[]) {
    mapa[r.lid] = r.phone_e164;
  }
  return mapa;
}

/**
 * LID → telefone que o próprio banco já aprendeu.
 *
 * Toda conversa por LID que um dia foi identificada — pelo remoteJidAlt, por
 * vínculo manual ou pelo nome — ficou gravada com o LID como `chat_id` na
 * mensagem e como `wa_jid` no lead. Os outros mapas não lembram disso: o do
 * remoteJidAlt é remontado a cada sincronização só com as páginas lidas
 * naquela rodada, e o webhook nem tem esse mapa. Resultado: a mensagem nova
 * de um contato já conhecido chegava só com o LID e caía em "não
 * identificadas", embora a conversa antiga dele estivesse no lead certo.
 *
 * Recebe só os LIDs que interessam, para o webhook fazer uma consulta pequena.
 */
export async function lidsAprendidos(
  admin: SupabaseClient,
  lids: string[],
): Promise<Record<string, string>> {
  const mapa: Record<string, string> = {};
  const faltam = new Set(lids.map((l) => `${l}@lid`));
  const achou = (jid: string, phone: string | null | undefined) => {
    if (!phone || !faltam.has(jid)) return;
    mapa[jid.slice(0, -"@lid".length)] = phone;
    faltam.delete(jid);
  };

  const LOTE = 100;
  const todos = [...faltam];

  // 1. O lead guarda o chat mais recente — resolve quase tudo numa consulta.
  for (let i = 0; i < todos.length; i += LOTE) {
    const { data, error } = await admin
      .from("wa_leads")
      .select("wa_jid, phone_e164")
      .in("wa_jid", todos.slice(i, i + LOTE));
    if (error) {
      console.error("[wa-lid-links] falha ao ler leads por LID:", error.message);
      return mapa;
    }
    for (const r of (data ?? []) as { wa_jid: string; phone_e164: string | null }[]) {
      achou(r.wa_jid, r.phone_e164);
    }
  }

  // 2. O resto pelas mensagens: o lead pode ter trocado de chat depois.
  // Um chat longo pode ocupar a página toda, então repete com o que sobrou.
  const idsPorJid = new Map<string, string>();
  for (let rodada = 0; faltam.size > 0 && rodada < 20; rodada++) {
    const lote = [...faltam].slice(0, LOTE);
    const { data, error } = await admin
      .from("wa_messages")
      .select("chat_id, lead_id")
      .in("chat_id", lote)
      .limit(1000);
    if (error) {
      console.error("[wa-lid-links] falha ao ler mensagens por LID:", error.message);
      break;
    }
    const linhas = (data ?? []) as { chat_id: string; lead_id: string }[];
    for (const r of linhas) {
      if (!idsPorJid.has(r.chat_id)) idsPorJid.set(r.chat_id, r.lead_id);
    }
    // Sem mensagem gravada: esses LIDs nunca foram identificados.
    for (const jid of lote) if (!idsPorJid.has(jid)) faltam.delete(jid);
    for (const jid of idsPorJid.keys()) faltam.delete(jid);
  }

  const leadIds = [...new Set(idsPorJid.values())];
  const telefonePorLead = new Map<string, string>();
  for (let i = 0; i < leadIds.length; i += LOTE) {
    const { data } = await admin
      .from("wa_leads")
      .select("id, phone_e164")
      .in("id", leadIds.slice(i, i + LOTE));
    for (const r of (data ?? []) as { id: string; phone_e164: string | null }[]) {
      if (r.phone_e164) telefonePorLead.set(r.id, r.phone_e164);
    }
  }
  for (const [jid, leadId] of idsPorJid) {
    const phone = telefonePorLead.get(leadId);
    if (phone) mapa[jid.slice(0, -"@lid".length)] = phone;
  }

  return mapa;
}

import type { PendingLidMessage, WhatsAppProvider } from "./provider";

const PAGINA = 200;

export type Varredura = {
  pendentes: PendingLidMessage[];
  /** LID → telefone aprendido do remoteJidAlt: esses já se resolvem sozinhos. */
  lidMapAlt: Record<string, string>;
  paginas: number;
  chegouAoFim: boolean;
};

/**
 * Lê o histórico inteiro atrás das mensagens que só têm LID.
 *
 * Página a página, porque o filtro por chat da Evolution v2.3 não funciona
 * (ver fetchMessagesPage). Para no teto de tempo e diz se chegou ao fim.
 */
export async function varrerPendentes(
  provider: WhatsAppProvider,
  limiteMs: number,
): Promise<Varredura> {
  const inicio = Date.now();
  const r: Varredura = { pendentes: [], lidMapAlt: {}, paginas: 0, chegouAoFim: false };

  for (let page = 1; Date.now() - inicio < limiteMs; page++) {
    const lote = await provider.fetchMessagesPage({ page, pageSize: PAGINA });
    r.paginas += 1;
    r.pendentes.push(...lote.pendentes);
    Object.assign(r.lidMapAlt, lote.lidMap);
    if (lote.brutas < PAGINA) {
      r.chegouAoFim = true;
      break;
    }
  }
  return r;
}
