import { toInstagramHandle } from "@/lib/leads/instagram";
import type {
  EffectiveTemperature,
  FunnelStage,
  LeadStatus,
} from "@/lib/leads/taxonomy";
import type {
  Lead,
  LeadAnalysis,
  LeadRentals,
  MessageType,
  WaMessage,
} from "./leads-types";

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
 * Quantos meses sem alugar antes de um cliente deixar de ser "ativo".
 *
 * Escolhido pelo dono: a carteira dele aluga com frequência, então três meses
 * de silêncio já é sinal de esfriamento, não sazonalidade.
 */
export const MESES_CLIENTE_ATIVO = 3;

/**
 * A situação que a tela usa.
 *
 * O rótulo do dono prevalece; sem ele, deriva da agenda — que é o fato, não
 * uma opinião. Um cliente que alugou é cliente, e ninguém precisa manter isso
 * à mão em centenas de leads.
 *
 * A ordem importa: locação recente ganha de locação antiga, que ganha de
 * conversa, que ganha de nada.
 *
 * Mensagem pelo direct conta como conversa: o Instagram não sincroniza, então
 * `last_message_at` nunca muda por ele, e um lead abordado por lá continuava
 * em "Novo" ao lado de quem ninguém procurou.
 */
export function situacaoEfetiva(
  lead: Pick<Lead, "status" | "last_message_at" | "instagram_sent_at">,
  rentals: Pick<LeadRentals, "ultima"> | null,
): LeadStatus {
  if (lead.status) return lead.status;

  if (rentals?.ultima) {
    const corte = new Date();
    corte.setMonth(corte.getMonth() - MESES_CLIENTE_ATIVO);
    return new Date(rentals.ultima) >= corte ? "cliente" : "inativo";
  }

  return lead.last_message_at || lead.instagram_sent_at
    ? "em_conversa"
    : "novo";
}

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

/**
 * De quem é a bola.
 *
 * A pergunta que a caixa de entrada precisa responder num relance é "a quem eu
 * mando agora, e a quem eu já mandei e só preciso esperar?". Antes disto a tela
 * não distinguia "nunca abordei" de "mandei e estou esperando": os dois casos
 * ficavam sem selo nenhum, o que jogava os leads de planilha no mesmo silêncio
 * de quem recebeu mensagem semana passada.
 *
 * As três saídas são excludentes de propósito — todo lead está em exatamente
 * uma, e a soma dos filtros fecha com o total.
 *
 * O que NÃO entra aqui: cópia do rascunho e clique em "Abrir no WhatsApp".
 * Abrir o app não é ter enviado, e o dono preferiu que só o fato conte. O preço
 * dessa escolha é o atraso: mensagem mandada pelo WhatsApp só aparece depois de
 * sincronizar, quando ela volta do celular e preenche `last_outbound_at`. No
 * Instagram vale o botão "Já enviei pelo Instagram" ou a sincronização do
 * direct, que preenchem a mesma coluna, `instagram_sent_at`.
 */
export type EstadoContato = {
  estado: "nunca_abordado" | "devo_responder" | "aguardando_ele";
  /** Quando a bola passou de lado. Nulo em "nunca abordado". */
  desde: string | null;
  /** Por onde saiu a última mensagem nossa. Nulo quando não saiu nenhuma. */
  canal: "whatsapp" | "instagram" | null;
};

export function estadoContato(
  lead: Pick<Lead, "last_inbound_at" | "last_outbound_at" | "instagram_sent_at">,
): EstadoContato {
  const { last_inbound_at, last_outbound_at, instagram_sent_at } = lead;

  // Ele falou por último: a bola é nossa. Mesma regra de sempre, agora num
  // lugar só — ela estava copiada na lista, no priorityScore e no prompt da IA.
  //
  // "Por último" compara com a nossa saída mais recente por QUALQUER canal.
  // Com o direct sincronizado, a resposta dele pelo Instagram cai em
  // last_inbound_at e a nossa em instagram_sent_at; olhando só o WhatsApp, o
  // lead ficaria em "Devo responder" mesmo depois de respondido no direct.
  const nossaUltima = [last_outbound_at, instagram_sent_at]
    .filter((d): d is string => d != null)
    .map((d) => new Date(d).getTime());
  if (
    last_inbound_at != null &&
    (nossaUltima.length === 0 ||
      new Date(last_inbound_at).getTime() > Math.max(...nossaUltima))
  ) {
    return { estado: "devo_responder", desde: last_inbound_at, canal: null };
  }

  // Saímos por algum canal: vale a saída mais recente, porque é ela que diz há
  // quanto tempo ele está devendo resposta.
  const saida =
    last_outbound_at && instagram_sent_at
      ? new Date(last_outbound_at) >= new Date(instagram_sent_at)
        ? ({ desde: last_outbound_at, canal: "whatsapp" } as const)
        : ({ desde: instagram_sent_at, canal: "instagram" } as const)
      : last_outbound_at
        ? ({ desde: last_outbound_at, canal: "whatsapp" } as const)
        : instagram_sent_at
          ? ({ desde: instagram_sent_at, canal: "instagram" } as const)
          : null;

  if (saida) return { estado: "aguardando_ele", ...saida };

  return { estado: "nunca_abordado", desde: null, canal: null };
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
  if (estadoContato(lead).estado === "devo_responder") score += 25;

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

/**
 * O Instagram do lead, como handle pronto para virar link.
 *
 * Duas fontes, nesta ordem:
 *
 *   1. a coluna `instagram`, que a importação preenche desde a 0015;
 *   2. as colunas extras — porque quem já subiu uma planilha com Instagram
 *      antes da 0015 teve aquilo guardado em `extra` como qualquer outra
 *      coluna solta, e obrigá-lo a reimportar para ganhar o botão seria
 *      esconder um dado que já está no banco.
 *
 * A segunda fonte herda o teto de `extraFields`: passando de doze colunas
 * extras, as que sobram não são lidas. Quem cair nesse caso resolve marcando a
 * coluna como "Instagram" na próxima importação.
 */
export function instagramDoLead(
  lead: Pick<Lead, "instagram" | "extra">,
): string | null {
  const daColuna = toInstagramHandle(lead.instagram);
  if (daColuna) return daColuna;

  for (const [chave, valor] of extraFields(lead.extra)) {
    if (!/instagram|insta|^ig$/i.test(semAcento(chave).toLowerCase())) continue;
    const handle = toInstagramHandle(valor);
    if (handle) return handle;
  }

  return null;
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
 * Reação (👍, 🙏…) a uma mensagem.
 *
 * O parser grava a reação como "other" com o emoji em `body` — ela é o único
 * "other" que carrega texto. Sem essa distinção, um 🙏 aparecia como "anexo"
 * na tela e como "[anexo]" para a IA, que passava a falar de um arquivo que
 * nunca existiu. Não ganhou tipo próprio para não exigir migração do check de
 * `message_type` antes de o código novo entrar.
 */
export function ehReacao(
  msg: Pick<WaMessage, "body" | "message_type">,
): boolean {
  return msg.message_type === "other" && Boolean(msg.body?.trim());
}

/**
 * Texto curto de uma mensagem para a lista. Mídia nunca é baixada nem embutida:
 * vira rótulo. Isso vale tanto para a tela quanto para o que mandamos à IA.
 */
export function messagePreview(
  msg: Pick<WaMessage, "body" | "caption" | "message_type"> | null,
  maxLen = 120,
): string {
  if (!msg) return "";
  if (ehReacao(msg)) return `reagiu com ${msg.body!.trim()}`;
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

/**
 * Troca "bom dia" / "boa tarde" / "boa noite" pela saudação da hora atual.
 *
 * A IA escreve o rascunho num horário e o dono envia em outro — um "boa tarde"
 * gerado à tarde e mandado na manhã seguinte obrigava a editar a mensagem. A
 * troca acontece na tela, então vale também para rascunhos já gravados, sem
 * reanalisar (e pagar de novo) nenhum lead. A hora é a de São Paulo, não a do
 * servidor, para a renderização no servidor e no navegador darem o mesmo texto.
 */
export function ajustarSaudacao(texto: string, agora: Date = new Date()): string {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Sao_Paulo",
    }).format(agora),
  );
  const certa =
    hora >= 5 && hora < 12 ? "bom dia" : hora >= 12 && hora < 18 ? "boa tarde" : "boa noite";

  // "Tenha uma boa noite" é despedida, não saudação — e trocar viraria
  // "tenha uma bom dia". Com artigo ou adjetivo antes, fica como está.
  const saudacao =
    /(?<!(?:^|[^\p{L}])(?:um|uma|ótimo|ótima|excelente|belo|bela)\s+)\b(bom dia|boa tarde|boa noite)\b/giu;

  return texto.replace(saudacao, (achada) =>
    achada[0] === achada[0].toUpperCase()
      ? certa[0].toUpperCase() + certa.slice(1)
      : certa,
  );
}
