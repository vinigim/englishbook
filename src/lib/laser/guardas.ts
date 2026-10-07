import type { EntradaConsulta, Historico, Recomendacao, Regiao } from "./tipos";

/**
 * Regras que o CÓDIGO aplica, não o modelo.
 *
 * O prompt pede para o modelo respeitar tudo isto, mas uma instrução no
 * prompt é um pedido, não uma garantia. O que não pode falhar mora aqui:
 *
 * - Bloqueios: contraindicações absolutas encerram a consulta antes de
 *   qualquer chamada à IA. Não há o que recomendar, e não se paga nada.
 * - Verificações: a resposta do modelo é conferida contra os limites do
 *   aparelho e contra regras conservadoras por fototipo e região. O que
 *   passar do ponto vira aviso na tela, ao lado do parâmetro.
 *
 * Os avisos não alteram os números do modelo. Corrigir em silêncio esconderia
 * do médico que a recomendação passou do limite; o aviso mostra.
 */

// ============================================================================
//  Limites do aparelho (ver trecho "equip-limites" da base)
// ============================================================================
export const LIMITES = {
  potencia_w: { min: 1, max: 50, maxLiteratura: 30 },
  dwell_time_us: { min: 200, max: 2000 },
  spacing_um: { min: 200, max: 1000 },
  smartstack: { min: 1, max: 5 },
} as const;

// ============================================================================
//  Bloqueios
// ============================================================================
const BLOQUEIOS: Partial<Record<Historico, string>> = {
  gestacao:
    "Gestação é contraindicação absoluta ao CO2 fracionado. Adie o tratamento para depois da gestação.",
  infeccao_ativa_area:
    "Há infecção ativa na área. Trate a infecção e só programe o laser depois da resolução completa.",
};

export function motivoDeBloqueio(entrada: EntradaConsulta): string | null {
  for (const h of entrada.historico) {
    const motivo = BLOQUEIOS[h];
    if (motivo) return motivo;
  }
  return null;
}

/** Recomendação montada pelo código quando a consulta é bloqueada. */
export function recomendacaoBloqueada(motivo: string): Recomendacao {
  return {
    viabilidade: "nao_recomendado",
    resumo: motivo,
    alertas: [motivo],
    parametros: null,
    protocolo: {
      sessoes: "—",
      intervalo: "—",
      teste_previo: "—",
      como_progredir: "Reavaliar quando a contraindicação deixar de existir.",
    },
    cuidados_pre: [],
    cuidados_pos: [],
    alternativas: [],
    fontes: ["seg-contraindicacoes"],
    confianca: "alta",
    motivo_confianca: "Contraindicação absoluta, aplicada pelo sistema sem consultar a IA.",
  };
}

// ============================================================================
//  Verificações da resposta
// ============================================================================
const PELE_FINA: readonly Regiao[] = ["periorbital", "pescoco", "colo", "maos"];
const EXTRAFACIAL: readonly Regiao[] = [
  "pescoco",
  "colo",
  "maos",
  "bracos",
  "abdome",
  "coxas_gluteos",
  "dorso",
];

export function verificarRecomendacao(
  entrada: EntradaConsulta,
  rec: Recomendacao,
): string[] {
  const avisos: string[] = [];
  const p = rec.parametros;

  if (rec.viabilidade !== "nao_recomendado" && !p) {
    avisos.push(
      "A IA indicou o tratamento mas não devolveu parâmetros. Gere a consulta de novo.",
    );
  }
  if (!p) return avisos;

  // --- Limites do aparelho ---------------------------------------------------
  const foraDoLimite = (
    nome: string,
    valor: number,
    min: number,
    max: number,
    unidade: string,
  ) => {
    if (valor < min || valor > max) {
      avisos.push(
        `${nome} de ${valor} ${unidade} está fora da faixa do aparelho (${min}–${max} ${unidade}). Não use este valor.`,
      );
    }
  };
  foraDoLimite("Potência", p.potencia_w.valor, LIMITES.potencia_w.min, LIMITES.potencia_w.max, "W");
  foraDoLimite("Dwell time", p.dwell_time_us.valor, LIMITES.dwell_time_us.min, LIMITES.dwell_time_us.max, "µs");
  foraDoLimite("Spacing", p.spacing_um.valor, LIMITES.spacing_um.min, LIMITES.spacing_um.max, "µm");
  foraDoLimite("SmartStack", p.smartstack.valor, LIMITES.smartstack.min, LIMITES.smartstack.max, "");

  if (!Number.isInteger(p.smartstack.valor)) {
    avisos.push(`SmartStack precisa ser inteiro; a IA sugeriu ${p.smartstack.valor}.`);
  }
  if (
    p.potencia_w.valor > LIMITES.potencia_w.maxLiteratura &&
    p.potencia_w.valor <= LIMITES.potencia_w.max
  ) {
    avisos.push(
      `Potência acima de ${LIMITES.potencia_w.maxLiteratura} W não aparece nos estudos com o scanner DOT.`,
    );
  }

  // --- Valor dentro da própria faixa ----------------------------------------
  for (const [nome, param] of [
    ["Potência", p.potencia_w],
    ["Dwell time", p.dwell_time_us],
    ["Spacing", p.spacing_um],
    ["SmartStack", p.smartstack],
  ] as const) {
    if (param.valor < param.faixa_min || param.valor > param.faixa_max) {
      avisos.push(
        `${nome}: o valor sugerido (${param.valor}) está fora da faixa que a própria IA indicou (${param.faixa_min}–${param.faixa_max}).`,
      );
    }
  }

  // --- Regras conservadoras por fototipo -------------------------------------
  const fototipoAlto = ["IV", "V", "VI"].includes(entrada.fototipo);
  const fototipoMuitoAlto = ["V", "VI"].includes(entrada.fototipo);

  if (fototipoAlto && p.dwell_time_us.valor > 800) {
    avisos.push(
      `Dwell de ${p.dwell_time_us.valor} µs em fototipo ${entrada.fototipo}: acima de 800 µs o risco de mancha sobe. Confira antes de usar.`,
    );
  }
  if (fototipoMuitoAlto && p.spacing_um.valor < 800) {
    avisos.push(
      `Spacing de ${p.spacing_um.valor} µm em fototipo ${entrada.fototipo}: a regra conservadora é ≥ 800 µm.`,
    );
  }
  if (fototipoAlto && p.modo_varredura.valor !== "SmartTrack") {
    avisos.push(
      `Em fototipo ${entrada.fototipo}, use SmartTrack para reduzir o acúmulo de calor.`,
    );
  }

  // --- Regras conservadoras por região ---------------------------------------
  if (PELE_FINA.includes(entrada.regiao)) {
    if (p.smartstack.valor > 2) {
      avisos.push(
        `SmartStack ${p.smartstack.valor} em pele fina: a regra conservadora é stack 1–2.`,
      );
    }
    if (p.potencia_w.valor > 15) {
      avisos.push(
        `Potência de ${p.potencia_w.valor} W em pele fina: acima do ponto de partida conservador (até ~12 W).`,
      );
    }
  }
  if (EXTRAFACIAL.includes(entrada.regiao) && p.spacing_um.valor < 600) {
    avisos.push(
      `Spacing de ${p.spacing_um.valor} µm fora da face: a cicatrização é mais lenta; a regra conservadora é ≥ 800 µm.`,
    );
  }
  if (EXTRAFACIAL.includes(entrada.regiao) && p.passadas.valor > 1) {
    avisos.push("Fora da face, prefira uma única passada.");
  }

  // --- Primeira sessão --------------------------------------------------------
  if (entrada.sessao === "primeira" && p.smartstack.valor >= 4) {
    avisos.push(
      `SmartStack ${p.smartstack.valor} na primeira sessão: comece mais baixo e suba conforme a resposta.`,
    );
  }

  return avisos;
}
