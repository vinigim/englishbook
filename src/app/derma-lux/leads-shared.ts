import type {
  EffectiveTemperature,
  FunnelStage,
} from "@/lib/leads/taxonomy";
import type { Lead, LeadAnalysis, MessageType, WaMessage } from "./leads-types";

/**
 * Prioridade é calculada aqui, em TypeScript puro — não pela IA.
 *
 * O motivo é simples: o dono precisa confiar na ordem da caixa de entrada, e
 * uma fórmula determinística ele consegue conferir de cabeça. A IA responde
 * "o que dizer"; a ordem de "com quem falar primeiro" é aritmética.
 */
const TEMPERATURE_WEIGHT: Record<EffectiveTemperature, number> = {
  quente: 3,
  morno: 2,
  frio: 1,
  // Confirmado pelo dono pesa mais que a leitura equivalente da IA: quente que
  // ele validou vai na frente de quente que o modelo supôs, e frio que ele
  // validou afunda mais que frio suposto.
  quente_confirmado: 4,
  frio_confirmado: 0,
};

/**
 * A temperatura que a tela usa.
 *
 * A marcação do dono prevalece; sem ela, vale a leitura da IA. Devolve `null`
 * quando não há nenhuma das duas — lead ainda sem análise e sem marcação.
 */
export function temperaturaEfetiva(
  lead: Pick<Lead, "temperature_manual">,
  analysis: Pick<LeadAnalysis, "temperature"> | null,
): EffectiveTemperature | null {
  return lead.temperature_manual ?? analysis?.temperature ?? null;
}

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

  let score =
    TEMPERATURE_WEIGHT[temperaturaEfetiva(lead, analysis) ?? analysis.temperature] * 10;
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

/**
 * Teto para as colunas extras da planilha.
 *
 * Elas chegam à IA porque costumam carregar o que mais importa — um "telefone
 * não tem WhatsApp" muda completamente o que faz sentido sugerir. Mas planilha
 * é terreno livre: alguém pode importar trinta colunas de lixo, e isso viraria
 * custo de token e ruído para o modelo.
 */
const MAX_EXTRA_FIELDS = 12;
const MAX_EXTRA_VALUE_CHARS = 200;

/**
 * Normaliza `extra` num par ordenado de chave/valor.
 *
 * Mora aqui, e não junto do pipeline de IA, porque a tela do lead também usa —
 * e ela é client component: importar de lá arrastaria o SDK da Anthropic e o
 * `node:crypto` para o bundle do navegador.
 *
 * A ordem alfabética é deliberada: o hash de cache da análise é calculado em
 * cima disto, e a ordem de iteração de um objeto vindo do banco não é
 * garantida — sem ordenar, o mesmo lead geraria hashes diferentes e pagaria
 * análise de novo à toa.
 */
export function extraFields(
  extra: Record<string, unknown> | null | undefined,
): [string, string][] {
  if (!extra || typeof extra !== "object") return [];

  return Object.entries(extra)
    .map(([chave, valor]): [string, string] => {
      const texto =
        valor == null
          ? ""
          : typeof valor === "string"
            ? valor
            : JSON.stringify(valor);
      return [chave.trim(), texto.trim().slice(0, MAX_EXTRA_VALUE_CHARS)];
    })
    .filter(([chave, valor]) => chave !== "" && valor !== "")
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, MAX_EXTRA_FIELDS);
}

/**
 * Interpreta uma data escrita na planilha.
 *
 * Sem isto, a IA lê "17/07/2026" como um rótulo qualquer e não percebe que
 * aquilo foi há dois meses. Foi exatamente assim que um lead parado desde
 * julho virou "aguardar resposta" em vez de follow-up: a data estava lá, o
 * tempo decorrido não.
 *
 * Aceita o formato brasileiro (17/07/2026) e o ISO (2026-07-17). Devolve
 * `null` para qualquer outra coisa — é melhor não saber a data do que inventar
 * uma.
 */
export function parseSheetDate(valor: string): Date | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  let ano: number;
  let mes: number;
  let dia: number;

  const br = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (br) {
    // Planilha brasileira: o dia vem primeiro. Ler como mm/dd colocaria
    // 07/06 no mês errado sem avisar ninguém.
    dia = Number(br[1]);
    mes = Number(br[2]);
    ano = Number(br[3]);
  } else if (iso) {
    ano = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else {
    return null;
  }

  const data = new Date(Date.UTC(ano, mes - 1, dia));

  // O construtor normaliza 31/02 para 03/03 em silêncio. Comparar de volta é
  // o que separa uma data real de uma inventada.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }

  return data;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Acha, entre as colunas extras, a data que representa o último contato.
 *
 * Uma coluna chamada "Data do Contato" vale mais que uma data qualquer perdida
 * na planilha; entre várias, a mais recente é a que diz há quanto tempo o lead
 * esfriou.
 */
export function sheetContactDate(
  extras: [string, string][],
): { chave: string; data: Date } | null {
  const comData = extras
    .map(([chave, valor]) => ({ chave, data: parseSheetDate(valor) }))
    .filter((e): e is { chave: string; data: Date } => e.data !== null);

  if (comData.length === 0) return null;

  const doContato = comData.filter((e) => /contat|contact/i.test(semAcento(e.chave)));
  const candidatos = doContato.length > 0 ? doContato : comData;

  return candidatos.reduce((a, b) => (a.data > b.data ? a : b));
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
