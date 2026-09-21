import type { SupabaseClient } from "@supabase/supabase-js";
import { waJidPhone, waPhoneKey } from "@/lib/leads/phone";
import type { NormalizedMessage } from "./provider";

/**
 * Grava mensagens normalizadas no banco.
 *
 * Usado tanto pelo webhook (mensagens novas) quanto pelo backfill (histórico),
 * porque os dois precisam exatamente das mesmas garantias:
 *
 *  - idempotência: a constraint unique (provider, provider_message_id) faz com
 *    que reprocessar o mesmo evento não duplique nada;
 *  - deduplicação por phone_key, para que o mesmo médico com e sem o 9º dígito
 *    caia numa conversa só;
 *  - os carimbos de last_*_at nunca andam para trás, o que importa porque o
 *    backfill traz mensagens antigas depois que o webhook já viu as recentes.
 */

export type IngestResult = {
  leadsCriados: number;
  leadsAtualizados: number;
  mensagensGravadas: number;
  ignoradas: number;
  /**
   * Mensagens descartadas porque o interlocutor não tem telefone discável —
   * na prática, conversas que só existem como LID. Contadas à parte de
   * `ignoradas` (grupos) para que o backfill possa dizer quantas conversas
   * ficaram de fora, em vez de o dono descobrir pelo total que não fecha.
   */
  telefoneInvalido: number;
};

type ExistingLead = {
  id: string;
  phone_key: string;
  display_name: string | null;
  first_seen_at: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  source: string;
};

const vazio: IngestResult = {
  leadsCriados: 0,
  leadsAtualizados: 0,
  mensagensGravadas: 0,
  ignoradas: 0,
  telefoneInvalido: 0,
};

/** Maior de duas datas ISO, tolerando nulos. */
function maisRecente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Menor de duas datas ISO, tolerando nulos. */
function maisAntiga(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

export async function ingestMessages(
  admin: SupabaseClient,
  provider: string,
  messages: NormalizedMessage[],
): Promise<IngestResult> {
  if (messages.length === 0) return { ...vazio };

  const resultado: IngestResult = { ...vazio };

  // Grupos não viram lead: uma conversa de grupo não é um lead comercial, e
  // misturá-los poluiria o radar inteiro.
  const relevantes = messages.filter((m) => {
    if (m.isGroup) {
      resultado.ignoradas += 1;
      return false;
    }
    return true;
  });

  if (relevantes.length === 0) return resultado;

  // ---------------------------------------------------------------- agrupar
  type Grupo = {
    phoneKey: string;
    phoneE164: string;
    chatId: string;
    pushName: string | null;
    primeira: string | null;
    ultima: string | null;
    ultimaEntrada: string | null;
    ultimaSaida: string | null;
    temEntrada: boolean;
    mensagens: NormalizedMessage[];
  };

  const grupos = new Map<string, Grupo>();

  for (const msg of relevantes) {
    // Rede de segurança, com o mesmo libphonenumber da importação de planilha.
    //
    // Um JID que não conhecemos — LID sem telefone ao lado, formato novo de
    // alguma versão futura — sai daqui como uma sequência de dígitos que
    // PARECE telefone. Sem validar, cada um desses vira um lead fantasma que
    // nunca se funde com o contato certo. É exatamente o que aconteceu na
    // primeira sincronização real, e é barato impedir.
    const phoneE164 = waJidPhone(msg.phoneE164);
    if (!phoneE164) {
      resultado.telefoneInvalido += 1;
      continue;
    }

    const phoneKey = waPhoneKey(phoneE164);
    if (!phoneKey) {
      resultado.ignoradas += 1;
      continue;
    }

    let g = grupos.get(phoneKey);
    if (!g) {
      g = {
        phoneKey,
        phoneE164,
        chatId: msg.chatId,
        pushName: null,
        primeira: null,
        ultima: null,
        ultimaEntrada: null,
        ultimaSaida: null,
        temEntrada: false,
        mensagens: [],
      };
      grupos.set(phoneKey, g);
    }

    g.mensagens.push(msg);
    g.primeira = maisAntiga(g.primeira, msg.sentAt);
    g.ultima = maisRecente(g.ultima, msg.sentAt);

    if (msg.direction === "in") {
      g.temEntrada = true;
      g.ultimaEntrada = maisRecente(g.ultimaEntrada, msg.sentAt);
      // Só a mensagem recebida traz o nome que a pessoa escolheu no WhatsApp.
      if (msg.pushName) g.pushName = msg.pushName;
    } else {
      g.ultimaSaida = maisRecente(g.ultimaSaida, msg.sentAt);
    }

    // O E.164 mais completo vence: se o WhatsApp mandou sem o 9º dígito mas a
    // planilha tinha com, queremos guardar a forma discável.
    if (phoneE164.length > g.phoneE164.length) g.phoneE164 = phoneE164;
  }

  const chaves = [...grupos.keys()];

  // -------------------------------------------------------- ler o que existe
  const existentes = new Map<string, ExistingLead>();
  const { data: existentesData, error: selectErr } = await admin
    .from("wa_leads")
    .select(
      "id, phone_key, display_name, first_seen_at, last_message_at, last_inbound_at, last_outbound_at, source",
    )
    .in("phone_key", chaves);

  if (selectErr) throw new Error(`falha ao ler leads: ${selectErr.message}`);
  for (const row of (existentesData ?? []) as ExistingLead[]) {
    existentes.set(row.phone_key, row);
  }

  // ------------------------------------------------------------ gravar leads
  const payloadLeads = [...grupos.values()].map((g) => {
    const prev = existentes.get(g.phoneKey);

    return {
      phone_key: g.phoneKey,
      phone_e164: g.phoneE164,
      wa_jid: g.chatId,
      // O nome do WhatsApp só preenche quando ainda não temos um.
      display_name: prev?.display_name ?? g.pushName ?? null,
      source: prev
        ? prev.source === "whatsapp"
          ? "whatsapp"
          : "ambos"
        : "whatsapp",
      first_seen_at: maisAntiga(prev?.first_seen_at ?? null, g.primeira),
      last_message_at: maisRecente(prev?.last_message_at ?? null, g.ultima),
      last_inbound_at: maisRecente(
        prev?.last_inbound_at ?? null,
        g.ultimaEntrada,
      ),
      last_outbound_at: maisRecente(
        prev?.last_outbound_at ?? null,
        g.ultimaSaida,
      ),
      // Só mensagem RECEBIDA torna a análise obsoleta. Uma resposta nossa não
      // muda o que precisamos decidir sobre o lead.
      ...(g.temEntrada ? { needs_analysis: true } : {}),
    };
  });

  const { data: leadsGravados, error: upsertErr } = await admin
    .from("wa_leads")
    .upsert(payloadLeads, { onConflict: "phone_key" })
    .select("id, phone_key");

  if (upsertErr) throw new Error(`falha ao gravar leads: ${upsertErr.message}`);

  const idPorChave = new Map<string, string>();
  for (const row of (leadsGravados ?? []) as { id: string; phone_key: string }[]) {
    idPorChave.set(row.phone_key, row.id);
  }

  resultado.leadsCriados = chaves.filter((k) => !existentes.has(k)).length;
  resultado.leadsAtualizados = chaves.filter((k) => existentes.has(k)).length;

  // ------------------------------------------------------- gravar mensagens
  const payloadMensagens: Record<string, unknown>[] = [];

  for (const g of grupos.values()) {
    const leadId = idPorChave.get(g.phoneKey);
    if (!leadId) {
      resultado.ignoradas += g.mensagens.length;
      continue;
    }

    for (const msg of g.mensagens) {
      payloadMensagens.push({
        lead_id: leadId,
        provider,
        provider_message_id: msg.providerMessageId,
        chat_id: msg.chatId,
        direction: msg.direction,
        message_type: msg.type,
        body: msg.body,
        caption: msg.caption,
        media_url: msg.mediaUrl,
        media_mime: msg.mediaMime,
        sent_at: msg.sentAt,
        raw: msg.raw ?? null,
      });
    }
  }

  // ignoreDuplicates faz o insert virar "on conflict do nothing": reprocessar
  // o mesmo evento é inofensivo, que é o que o webhook e o backfill precisam.
  for (const lote of emLotes(payloadMensagens, 500)) {
    const { data, error } = await admin
      .from("wa_messages")
      .upsert(lote, {
        onConflict: "provider,provider_message_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) throw new Error(`falha ao gravar mensagens: ${error.message}`);
    resultado.mensagensGravadas += (data ?? []).length;
  }

  return resultado;
}

function emLotes<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
