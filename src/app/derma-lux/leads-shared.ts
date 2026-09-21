import type { FunnelStage, Temperature } from "@/lib/leads/taxonomy";
import type { Lead, LeadAnalysis, MessageType, WaMessage } from "./leads-types";

/**
 * Prioridade é calculada aqui, em TypeScript puro — não pela IA.
 *
 * O motivo é simples: o dono precisa confiar na ordem da caixa de entrada, e
 * uma fórmula determinística ele consegue conferir de cabeça. A IA responde
 * "o que dizer"; a ordem de "com quem falar primeiro" é aritmética.
 */
const TEMPERATURE_WEIGHT: Record<Temperature, number> = {
  quente: 3,
  morno: 2,
  frio: 1,
};

const STAGE_WEIGHT: Record<FunnelStage, number> = {
  negociacao: 5,
  proposta_enviada: 4,
  agendado: 4,
  qualificando: 3,
  novo: 2,
  cliente_ativo: 2,
  cliente_inativo: 1,
  perdido: 0,
};

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function priorityScore(
  lead: Lead,
  analysis: LeadAnalysis | null,
): number {
  // Sem análise ainda: fica no meio da fila, ordenado por recência, para não
  // sumir atrás de leads já analisados nem furar a fila dos quentes.
  if (!analysis) {
    const dias = daysSince(lead.last_message_at) ?? 90;
    return 20 - Math.min(dias, 30) * 0.5;
  }

  if (analysis.recommended_action === "descartar") return -100;
  if (lead.snoozed_until && new Date(lead.snoozed_until) > new Date()) return -50;

  let score = TEMPERATURE_WEIGHT[analysis.temperature] * 10;
  score += STAGE_WEIGHT[analysis.stage] * 5;

  // O sinal mais forte: ele falou por último e ninguém respondeu.
  const awaitingReply =
    lead.last_inbound_at != null &&
    (lead.last_outbound_at == null ||
      new Date(lead.last_inbound_at) > new Date(lead.last_outbound_at));
  if (awaitingReply) score += 25;

  // Quanto mais frio o contato, mais a urgência decai.
  score -= Math.min(daysSince(lead.last_message_at) ?? 30, 30) * 0.5;

  if (analysis.is_existing_customer) score += 5;
  if (analysis.recommended_action === "aguardar") score -= 15;

  return Math.round(score * 10) / 10;
}

/** Nome a exibir, com os fallbacks na ordem em que confiamos neles. */
export function leadDisplayName(lead: Lead): string {
  return (
    lead.display_name ||
    lead.sheet_name ||
    lead.clinic_name ||
    formatPhoneBR(lead.phone_e164)
  );
}

/** "5535988887777" -> "+55 35 98888-7777" (formatação leve, sem dependência). */
export function formatPhoneBR(phoneE164: string): string {
  const d = String(phoneE164 ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    const meio = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
    const fim = rest.length === 9 ? rest.slice(5) : rest.slice(4);
    return `+55 ${ddd} ${meio}-${fim}`;
  }
  return phoneE164;
}

const MEDIA_LABEL: Record<MessageType, string> = {
  text: "",
  image: "🖼️ imagem",
  audio: "🎤 áudio",
  video: "🎬 vídeo",
  document: "📄 documento",
  sticker: "🙂 figurinha",
  location: "📍 localização",
  contact: "👤 contato",
  other: "anexo",
};

/**
 * Texto curto de uma mensagem para a lista. Mídia nunca é baixada nem embutida:
 * vira rótulo. Isso vale tanto para a tela quanto para o que mandamos à IA.
 */
export function messagePreview(
  msg: Pick<WaMessage, "body" | "caption" | "message_type"> | null,
  maxLen = 120,
): string {
  if (!msg) return "";
  const texto = msg.body || msg.caption || "";
  if (msg.message_type !== "text") {
    const rotulo = MEDIA_LABEL[msg.message_type] || "anexo";
    return texto ? `${rotulo} — ${truncate(texto, maxLen)}` : rotulo;
  }
  return truncate(texto, maxLen);
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/** "há 3 dias", "hoje", "ontem" — para a lista da caixa de entrada. */
export function relativeDays(iso: string | null): string {
  const dias = daysSince(iso);
  if (dias == null) return "sem contato";
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
}
