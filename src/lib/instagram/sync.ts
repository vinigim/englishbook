import type { SupabaseClient } from "@supabase/supabase-js";
import { toInstagramHandle } from "@/lib/leads/instagram";
import type { MessageType } from "@/app/derma-lux/leads-types";
import type {
  ContaInstagram,
  ConversaBruta,
  MensagemBruta,
  Participante,
} from "./api";

/**
 * Grava conversas do direct nos leads.
 *
 * O lead é achado pelo Instagram da planilha (`wa_leads.instagram`), que já
 * está normalizado como handle. Conversa de perfil que não é de nenhum lead
 * NÃO cria lead: o lead nasce de um telefone (phone_key é obrigatório), e um
 * perfil que escreveu no direct pode ser paciente, fornecedor, spam. Essas
 * conversas voltam na resposta, para o dono decidir.
 *
 * Nas datas do lead, a saída pelo Instagram vai para `instagram_sent_at`, a
 * mesma coluna do botão "Já enviei pelo Instagram" — é ela que faz a lista
 * dizer "mandei no Instagram" em vez de "no WhatsApp". A entrada vai para
 * `last_inbound_at`, como qualquer resposta: resposta é resposta, venha de
 * onde vier.
 */

export const PROVIDER_INSTAGRAM = "instagram";

export type LeadDoInstagram = {
  id: string;
  instagram: string | null;
  first_seen_at: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  instagram_sent_at: string | null;
};

export type ConversaSemLead = {
  username: string;
  ultimaEm: string;
  /** A pessoa escreveu alguma coisa — vale mais a pena olhar. */
  respondeu: boolean;
  trecho: string | null;
};

export type ResultadoConversas = {
  conversas: number;
  comLead: number;
  mensagensNovas: number;
  respostasNovas: number;
  leadsAtualizados: number;
  semLead: ConversaSemLead[];
  ambiguas: string[];
};

function iso(data: string): string {
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function maisRecente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function maisAntiga(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Tipo, texto e mídia de uma mensagem do direct.
 *
 * `other` só leva texto quando é reação (ver `ehReacao`), então anexo que não
 * reconhecemos vai como `other` SEM texto — senão a tela diria "reação".
 */
function conteudo(m: MensagemBruta): {
  tipo: MessageType;
  body: string | null;
  caption: string | null;
  mediaUrl: string | null;
} {
  const texto = m.message?.trim() ? m.message : null;
  const anexo = m.attachments?.data?.[0];

  if (!anexo) {
    return texto
      ? { tipo: "text", body: texto, caption: null, mediaUrl: null }
      : { tipo: "other", body: null, caption: null, mediaUrl: null };
  }

  const url = (v: unknown): string | null =>
    v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string"
      ? (v as { url: string }).url
      : null;

  const midia: [MessageType, string | null][] = [
    ["image", url(anexo.image_data)],
    ["video", url(anexo.video_data)],
    ["audio", url(anexo.audio_data)],
  ];
  for (const [tipo, mediaUrl] of midia) {
    if (mediaUrl) return { tipo, body: null, caption: texto, mediaUrl };
  }

  const arquivo = typeof anexo.file_url === "string" ? anexo.file_url : null;
  if (texto) return { tipo: "text", body: texto, caption: null, mediaUrl: arquivo };
  return { tipo: arquivo ? "document" : "other", body: null, caption: null, mediaUrl: arquivo };
}

export function mapaDeLeads(leads: LeadDoInstagram[]): {
  porHandle: Map<string, LeadDoInstagram>;
  repetidos: Set<string>;
} {
  const porHandle = new Map<string, LeadDoInstagram>();
  const repetidos = new Set<string>();
  // Datas no mesmo formato das que vêm da API. O Postgres devolve
  // "+00:00" e o toISOString "Z", e a comparação é por texto.
  const norm = (d: string | null) => (d ? iso(d) : null);
  for (const original of leads) {
    const l: LeadDoInstagram = {
      ...original,
      first_seen_at: norm(original.first_seen_at),
      last_message_at: norm(original.last_message_at),
      last_inbound_at: norm(original.last_inbound_at),
      instagram_sent_at: norm(original.instagram_sent_at),
    };
    const h = toInstagramHandle(l.instagram);
    if (!h) continue;
    if (porHandle.has(h)) repetidos.add(h);
    else porHandle.set(h, l);
  }
  // Dois leads com o mesmo @: colar a conversa em um deles seria chute.
  for (const h of repetidos) porHandle.delete(h);
  return { porHandle, repetidos };
}

export async function gravarConversas(
  admin: SupabaseClient,
  conta: ContaInstagram,
  conversas: ConversaBruta[],
  leads: { porHandle: Map<string, LeadDoInstagram>; repetidos: Set<string> },
): Promise<ResultadoConversas> {
  const resultado: ResultadoConversas = {
    conversas: conversas.length,
    comLead: 0,
    mensagensNovas: 0,
    respostasNovas: 0,
    leadsAtualizados: 0,
    semLead: [],
    ambiguas: [],
  };

  const nossos = new Set([conta.userId, conta.idApp]);
  const ehNosso = (p?: Participante): boolean =>
    Boolean(p && (nossos.has(String(p.id)) || p.username?.toLowerCase() === conta.username));

  for (const conversa of conversas) {
    const outro = (conversa.participants?.data ?? []).find((p) => !ehNosso(p));
    const username = outro?.username?.toLowerCase();
    const mensagens = conversa.messages?.data ?? [];
    if (!outro || !username || mensagens.length === 0) continue;

    const lead = leads.porHandle.get(username);
    if (!lead) {
      if (leads.repetidos.has(username)) {
        resultado.ambiguas.push(username);
        continue;
      }
      const dele = mensagens.find((m) => !ehNosso(m.from) && m.message?.trim());
      resultado.semLead.push({
        username,
        ultimaEm: iso(conversa.updated_time),
        respondeu: mensagens.some((m) => !ehNosso(m.from)),
        trecho: dele?.message?.slice(0, 120) ?? null,
      });
      continue;
    }

    resultado.comLead += 1;

    const linhas = mensagens.map((m) => {
      const c = conteudo(m);
      return {
        lead_id: lead.id,
        provider: PROVIDER_INSTAGRAM,
        provider_message_id: m.id,
        chat_id: `ig:${outro.id}`,
        direction: ehNosso(m.from) ? "out" : "in",
        message_type: c.tipo,
        body: c.body,
        caption: c.caption,
        media_url: c.mediaUrl,
        media_mime: null,
        sent_at: iso(m.created_time),
        raw: m,
      };
    });

    // Mesma idempotência do WhatsApp: reler a conversa não duplica nada.
    const { data: novas, error } = await admin
      .from("wa_messages")
      .upsert(linhas, {
        onConflict: "provider,provider_message_id",
        ignoreDuplicates: true,
      })
      .select("direction");
    if (error) throw new Error(`falha ao gravar mensagens: ${error.message}`);

    const inseridas = (novas ?? []) as { direction: string }[];
    const respostas = inseridas.filter((m) => m.direction === "in").length;
    resultado.mensagensNovas += inseridas.length;
    resultado.respostasNovas += respostas;

    // As datas do lead andam só para frente, como no WhatsApp: vale para a
    // releitura, que traz de novo mensagens já conhecidas.
    let primeira: string | null = null;
    let ultima: string | null = null;
    let ultimaEntrada: string | null = null;
    let ultimaSaida: string | null = null;
    for (const l of linhas) {
      primeira = maisAntiga(primeira, l.sent_at);
      ultima = maisRecente(ultima, l.sent_at);
      if (l.direction === "in") ultimaEntrada = maisRecente(ultimaEntrada, l.sent_at);
      else ultimaSaida = maisRecente(ultimaSaida, l.sent_at);
    }

    const atualizacao: Record<string, unknown> = {
      first_seen_at: maisAntiga(lead.first_seen_at, primeira),
      last_message_at: maisRecente(lead.last_message_at, ultima),
      last_inbound_at: maisRecente(lead.last_inbound_at, ultimaEntrada),
      instagram_sent_at: maisRecente(lead.instagram_sent_at, ultimaSaida),
    };
    // Só resposta NOVA pede outra análise, como no WhatsApp. Nossa mensagem
    // não muda o que há para decidir.
    if (respostas > 0) atualizacao.needs_analysis = true;

    const mudou =
      inseridas.length > 0 ||
      atualizacao.first_seen_at !== lead.first_seen_at ||
      atualizacao.last_message_at !== lead.last_message_at ||
      atualizacao.last_inbound_at !== lead.last_inbound_at ||
      atualizacao.instagram_sent_at !== lead.instagram_sent_at;
    if (!mudou) continue;

    const { error: upErr } = await admin
      .from("wa_leads")
      .update(atualizacao)
      .eq("id", lead.id);
    if (upErr) throw new Error(`falha ao atualizar lead: ${upErr.message}`);

    // O mesmo lead pode aparecer em outra página nesta rodada; o mapa precisa
    // enxergar as datas novas para não andar para trás.
    Object.assign(lead, atualizacao);
    resultado.leadsAtualizados += 1;
  }

  return resultado;
}
