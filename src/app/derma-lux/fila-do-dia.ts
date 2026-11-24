import {
  daysSince,
  estadoContato,
  paraReativar,
  priorityScore,
  situacaoEfetiva,
  temWhatsApp,
  temperaturaEfetiva,
} from "./leads-shared";
import type { Lead, LeadAnalysis, LeadRentals } from "./leads-types";
import { instagramDoLead } from "./leads-shared";

/**
 * Fila do dia: o trabalho de leads de hoje, montado às 6h (cron) e guardado em
 * `fila_do_dia` (0032), para a lista ficar parada o dia inteiro e mostrar o
 * progresso ("3 de 15 feitos"). Funções puras: o cron e a tela usam as mesmas.
 *
 * A ordem das seções é a ordem de trabalho combinada com o dono:
 *   1. responder quem escreveu;  2. quentes;  3. retomar contato (cadência);
 *   4. primeiros contatos (WhatsApp, depois Instagram);  5. ex-clientes.
 */

export const SECOES = [
  "responder",
  "quentes",
  "retomar",
  "primeiro_whatsapp",
  "primeiro_instagram",
  "reativar",
] as const;
export type Secao = (typeof SECOES)[number];

export const SECAO_LABEL: Record<Secao, string> = {
  responder: "Responder",
  quentes: "Quentes",
  retomar: "Retomar contato",
  primeiro_whatsapp: "Primeiro contato pelo WhatsApp",
  primeiro_instagram: "Primeiro contato pelo Instagram",
  reativar: "Reativar ex-cliente",
};

export const SECAO_DICA: Record<Secao, string> = {
  responder: "Ele falou por último. Os mais recentes primeiro.",
  quentes: "Cada um precisa de um próximo passo marcado.",
  retomar:
    "Sem resposta há 4 dias ou mais. Abra a ficha e gere a mensagem. Depois da despedida, marque Frio confirmado.",
  primeiro_whatsapp: "Não passe de uns 20 contatos novos por dia no WhatsApp.",
  primeiro_instagram: "Pelo direct; depois toque em \"Já enviei pelo Instagram\".",
  reativar: "Alugou há mais de 30 dias e não recebeu nada nosso desde então.",
};

/** Quantos primeiros contatos entram por dia em cada canal. */
export const META_PRIMEIRO_WHATSAPP = 15;
export const META_PRIMEIRO_INSTAGRAM = 10;

/** Cadência combinada (e seguida pela IA): 2ª aos 4 dias, 3ª aos 10, despedida aos 20. */
export const DIAS_SEGUNDA = 4;
export const DIAS_TERCEIRA = 10;
export const DIAS_DESPEDIDA = 20;

export type ItemFila = {
  leadId: string;
  /** "2ª mensagem", "despedida"... — só em "retomar". */
  etapa?: string;
};

export type FilaDoDia = {
  /** aaaa-mm-dd em São Paulo. */
  dia: string;
  gerada_em: string;
  secoes: Record<Secao, ItemFila[]>;
  /** Locações nos próximos 7 dias: dia de olhar "Janelas da rota". */
  locacoes_7d: number;
};

export type LinhaFila = {
  lead: Lead;
  analysis: LeadAnalysis | null;
  rentals: LeadRentals | null;
};

/** Sábado ou domingo em São Paulo: sem fila (o dono trabalha leads só em dias úteis). */
export function fimDeSemanaSP(agora: Date = new Date()): boolean {
  const dia = agora.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });
  return dia === "Sat" || dia === "Sun";
}

/** Data de hoje em São Paulo, aaaa-mm-dd. */
export function hojeSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function fora(l: LinhaFila): boolean {
  return (
    l.lead.archived ||
    l.lead.is_group ||
    situacaoEfetiva(l.lead, l.rentals) === "descartado" ||
    temperaturaEfetiva(l.lead, l.analysis) === "frio_confirmado"
  );
}

function ultimaSaida(lead: Lead): string | null {
  const a = lead.last_outbound_at;
  const b = lead.instagram_sent_at;
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function etapaRetomar(dias: number): string {
  if (dias >= DIAS_DESPEDIDA) return "despedida";
  if (dias >= DIAS_TERCEIRA) return "3ª mensagem";
  return "2ª mensagem";
}

export function montarFila(
  linhas: LinhaFila[],
  locacoes7d: number,
  agora: Date = new Date(),
): FilaDoDia {
  const usados = new Set<string>();
  const pega = (l: LinhaFila) => {
    usados.add(l.lead.id);
    return { leadId: l.lead.id };
  };
  const vivos = linhas.filter((l) => !fora(l));
  const porPrioridade = (a: LinhaFila, b: LinhaFila) =>
    priorityScore(b.lead, b.analysis) - priorityScore(a.lead, a.analysis);

  // 1. Responder: o mais recente primeiro — quem escreveu ontem ainda está
  // com o assunto na cabeça.
  const responder = vivos
    .filter((l) => estadoContato(l.lead).estado === "devo_responder")
    .sort((a, b) =>
      String(b.lead.last_inbound_at ?? "").localeCompare(String(a.lead.last_inbound_at ?? "")),
    )
    .map(pega);

  // 2. Quentes que não estão em "responder".
  const quentes = vivos
    .filter((l) => !usados.has(l.lead.id))
    .filter((l) => {
      const t = temperaturaEfetiva(l.lead, l.analysis);
      return t === "quente" || t === "quente_confirmado";
    })
    .sort(porPrioridade)
    .map(pega);

  // 3. Retomar: a última palavra foi nossa, ele nunca respondeu depois, e já
  // passou o prazo da próxima mensagem. Cliente ativo fica de fora (a conversa
  // dele não é prospecção).
  const retomar = vivos
    .filter((l) => !usados.has(l.lead.id))
    .filter((l) => situacaoEfetiva(l.lead, l.rentals) !== "cliente")
    .map((l) => ({ l, dias: daysSince(ultimaSaida(l.lead)) }))
    .filter(
      ({ l, dias }) =>
        estadoContato(l.lead).estado === "aguardando_ele" &&
        estadoContato(l.lead).canal !== null &&
        dias !== null &&
        dias >= DIAS_SEGUNDA,
    )
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))
    .map(({ l, dias }) => ({ ...pega(l), etapa: etapaRetomar(dias ?? 0) }));

  // 4. Primeiros contatos: os de maior prioridade, até a meta do dia.
  const nunca = vivos
    .filter((l) => !usados.has(l.lead.id))
    .filter((l) => estadoContato(l.lead).estado === "nunca_abordado")
    .sort(porPrioridade);
  const primeiroWhatsapp = nunca
    .filter((l) => temWhatsApp(l.lead) === true)
    .slice(0, META_PRIMEIRO_WHATSAPP)
    .map(pega);
  const primeiroInstagram = nunca
    .filter(
      (l) =>
        !usados.has(l.lead.id) &&
        temWhatsApp(l.lead) === false &&
        instagramDoLead(l.lead) &&
        !l.lead.instagram_sent_at,
    )
    .slice(0, META_PRIMEIRO_INSTAGRAM)
    .map(pega);

  // 5. Ex-clientes (regra da fila "Reativar ex-cliente").
  const reativar = vivos
    .filter((l) => !usados.has(l.lead.id) && paraReativar(l.lead, l.rentals, agora))
    .sort((a, b) => (b.rentals?.total_brl ?? 0) - (a.rentals?.total_brl ?? 0))
    .map(pega);

  return {
    dia: hojeSP(agora),
    gerada_em: agora.toISOString(),
    secoes: {
      responder,
      quentes,
      retomar,
      primeiro_whatsapp: primeiroWhatsapp,
      primeiro_instagram: primeiroInstagram,
      reativar,
    },
    locacoes_7d: locacoes7d,
  };
}

/**
 * Este item já foi feito hoje? Só por fato registrado, como em "De quem é a
 * bola": mensagem nossa (WhatsApp sincronizado ou "Já enviei pelo Instagram")
 * depois da montagem da fila, ou o dono tirou o lead do jogo (descartado,
 * frio confirmado, arquivado).
 */
export function itemFeito(
  linha: LinhaFila | undefined,
  secao: Secao,
  geradaEm: string,
): boolean {
  if (!linha) return true; // arquivado ou apagado desde a montagem
  if (fora(linha)) return true;
  // Como datas, e não como texto: o banco devolve "+00:00" e a fila guarda
  // "Z"; comparar as strings só funcionava por coincidência de formato.
  const saida = ultimaSaida(linha.lead);
  if (saida && new Date(saida).getTime() > new Date(geradaEm).getTime()) return true;
  if (secao === "responder") {
    return estadoContato(linha.lead).estado !== "devo_responder";
  }
  return false;
}

/** Texto curto do resumo, para o aviso das 6h. */
export function resumoTexto(fila: FilaDoDia): string {
  const n = (s: Secao) => fila.secoes[s].length;
  const partes = [
    `responder ${n("responder")}`,
    `quentes ${n("quentes")}`,
    `retomar ${n("retomar")}`,
    `primeiro contato ${n("primeiro_whatsapp")} WhatsApp + ${n("primeiro_instagram")} Instagram`,
  ];
  if (n("reativar")) partes.push(`ex-clientes ${n("reativar")}`);
  if (fila.locacoes_7d) partes.push(`${fila.locacoes_7d} locação(ões) em 7 dias: ver Janelas da rota`);
  return `Fila do dia ${fila.dia.split("-").reverse().join("/")}: ${partes.join(" · ")}.`;
}
