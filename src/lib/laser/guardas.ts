import {
  LESOES_FOCAIS,
  grupoDoFototipo,
  limitesDoGrupo,
  num,
  type LesaoFocalId,
} from "./protocolo-premium";
import {
  ACHADOS_DE_RISCO,
  type ParametroNumerico,
  type EntradaConsulta,
  type Historico,
  type Recomendacao,
  type Regiao,
} from "./tipos";

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
  potencia_w: { min: 1, max: 50 },
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
    perguntas_pendentes: [],
    analise_foto: null,
    parametros_focada: null,
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

  if (rec.viabilidade !== "nao_recomendado") {
    if (entrada.exposicaoSolar === "alta") {
      avisos.push(
        "Exposição solar alta prevista nas próximas semanas: o mais seguro é adiar a sessão.",
      );
    }
    if (entrada.caracteristicasPele.includes("acne_ativa")) {
      avisos.push(
        "Há acne inflamatória ativa na área: trate a acne antes do laser.",
      );
    }
  }

  // A IA tem de aplicar o ajuste conservador nos achados de risco da foto
  // (regra 15 do prompt). Se não aplicou, o código avisa.
  for (const d of rec.analise_foto?.divergencias ?? []) {
    if (ACHADOS_DE_RISCO.includes(d.achado) && !d.ajuste_aplicado && p) {
      avisos.push(
        `A foto sugere ${d.achado === "acne_ativa" ? "acne inflamatória ativa" : "rosácea ou pele sensível"} e a IA não deixou os parâmetros mais conservadores por isso. Confirme ou descarte o achado.`,
      );
    }
  }

  // --- Peça focada: outra tabela, outros parâmetros --------------------------
  if (entrada.indicacao === "lesao_focal") {
    avisos.push(...verificarFocada(entrada, rec));
    return avisos;
  }

  if (rec.viabilidade !== "nao_recomendado" && !p) {
    avisos.push(
      "A IA indicou o tratamento mas não devolveu parâmetros. Gere a consulta de novo.",
    );
  }
  if (!p) return avisos;

  const dwell = p.dwell_time_us?.valor ?? null;

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
  if (dwell != null) {
    foraDoLimite("Time", dwell, LIMITES.dwell_time_us.min, LIMITES.dwell_time_us.max, "µs");
  }
  foraDoLimite("Spacing", p.spacing_um.valor, LIMITES.spacing_um.min, LIMITES.spacing_um.max, "µm");
  foraDoLimite("SmartStack", p.smartstack.valor, LIMITES.smartstack.min, LIMITES.smartstack.max, "");

  if (!Number.isInteger(p.smartstack.valor)) {
    avisos.push(`SmartStack precisa ser inteiro; a IA sugeriu ${p.smartstack.valor}.`);
  }
  // No HP o time não se ajusta; nos outros pulsos ele é obrigatório.
  if (p.modo_emissao.valor !== "HP" && dwell == null) {
    avisos.push(
      `O pulso ${p.modo_emissao.valor} precisa de time, e a IA não informou. Gere a consulta de novo.`,
    );
  }

  // --- Valor dentro da própria faixa ----------------------------------------
  const numericos: [string, ParametroNumerico | null][] = [
    ["Potência", p.potencia_w],
    ["Time", p.dwell_time_us],
    ["Spacing", p.spacing_um],
    ["SmartStack", p.smartstack],
  ];
  for (const [nome, param] of numericos) {
    if (param && (param.valor < param.faixa_min || param.valor > param.faixa_max)) {
      avisos.push(
        `${nome}: o valor sugerido (${param.valor}) está fora da faixa que a própria IA indicou (${param.faixa_min}–${param.faixa_max}).`,
      );
    }
  }

  // --- Protocolo Premium: o que ele usa para o grupo de fototipo --------------
  // Os limites saem das tabelas (protocolo-premium.ts): um valor além do que o
  // protocolo usa para o grupo do paciente, em qualquer indicação, merece aviso.
  const grupo = grupoDoFototipo(entrada.fototipo);
  const lim = limitesDoGrupo(grupo);
  const fototipoTexto = `fototipo ${grupo.replace("-", " e ")}`;
  if (p.potencia_w.valor > lim.wattsMax) {
    avisos.push(
      `Potência de ${p.potencia_w.valor} W: acima do maior valor do protocolo Premium para ${fototipoTexto} (${lim.wattsMax} W).`,
    );
  }
  if (dwell != null && dwell > lim.timeMax) {
    avisos.push(
      `Time de ${dwell} µs: acima do maior valor do protocolo Premium para ${fototipoTexto} (${lim.timeMax} µs).`,
    );
  }
  if (p.spacing_um.valor < lim.spacingMin) {
    avisos.push(
      `Spacing de ${p.spacing_um.valor} µm: abaixo do menor valor do protocolo Premium para ${fototipoTexto} (${lim.spacingMin} µm).`,
    );
  }
  if (p.smartstack.valor > lim.stackMax) {
    avisos.push(
      `SmartStack ${p.smartstack.valor}: acima do maior stack das tabelas de pele do protocolo Premium (${lim.stackMax}).`,
    );
  }

  const fototipoAlto = ["IV", "V", "VI"].includes(entrada.fototipo);
  if (fototipoAlto && p.modo_varredura.valor !== "SmartTrack") {
    avisos.push(
      `Em fototipo ${entrada.fototipo}, use SmartTrack para reduzir o acúmulo de calor.`,
    );
  }

  // --- Região -----------------------------------------------------------------
  const peleFina =
    PELE_FINA.includes(entrada.regiao) ||
    entrada.caracteristicasPele.includes("fina_atrofica");
  if (peleFina) {
    if (p.smartstack.valor > 2) {
      avisos.push(
        `SmartStack ${p.smartstack.valor} em pele fina: as tabelas de pálpebras e corporal suave usam stack 2.`,
      );
    }
    if (p.potencia_w.valor > 15) {
      avisos.push(
        `Potência de ${p.potencia_w.valor} W em pele fina: as tabelas de pálpebras e corporal suave vão até 15 W.`,
      );
    }
  }
  // Rejuvenescimento e estrias no corpo: as tabelas corporais usam 750–900 µm.
  // Manchas e cicatrizes pontuais usam spacing baixo de propósito e ficam fora.
  const tratamentoDeArea =
    entrada.extensao === "regiao_inteira" &&
    ["rejuvenescimento", "estrias_rubras", "estrias_albas"].includes(entrada.indicacao);
  if (EXTRAFACIAL.includes(entrada.regiao) && tratamentoDeArea && p.spacing_um.valor < 750) {
    avisos.push(
      `Spacing de ${p.spacing_um.valor} µm fora da face: as tabelas corporais do protocolo usam 750–900 µm.`,
    );
  }
  if (EXTRAFACIAL.includes(entrada.regiao) && p.passadas.valor > 1) {
    avisos.push("Fora da face, prefira uma única passada.");
  }

  // --- Melasma: só refratário, e com parâmetros dos protocolos ---------------
  if (entrada.indicacao === "melasma") {
    if (!entrada.melasmaRefratario) {
      avisos.push(
        "Melasma sem falha de ≥ 3 meses de tratamento tópico: a literatura não apoia o CO2 como primeira linha.",
      );
    }
    if (
      p.spacing_um.valor < 800 ||
      (dwell ?? 0) > 400 ||
      p.smartstack.valor > 1 ||
      p.potencia_w.valor > 15
    ) {
      avisos.push(
        "Os estudos publicados de melasma usam ~12 W, spacing ~800 µm, time ~300 µs e stack 1. Esta sugestão é mais agressiva.",
      );
    }
  }

  // --- Drug delivery: abrir canais, não ablação profunda ---------------------
  const drugDelivery = entrada.associacoes.some((a) => a.startsWith("drug_delivery"));
  if (drugDelivery && p.smartstack.valor > 1) {
    avisos.push(
      `Para aplicar ativo logo após o laser, stack 1 basta; stack ${p.smartstack.valor} aprofunda sem ganho na entrega.`,
    );
  }

  // --- Sessão anterior --------------------------------------------------------
  const ant = entrada.sessao === "subsequente" ? entrada.sessaoAnterior : null;
  if (ant) {
    // "Mais agressivo": mais potência, time ou stack, ou spacing mais fechado.
    const comparacoes = [
      { nome: "Potência", atual: p.potencia_w.valor, antes: ant.potencia, sobe: true, u: "W" },
      { nome: "Time", atual: dwell, antes: ant.dwell, sobe: true, u: "µs" },
      { nome: "SmartStack", atual: p.smartstack.valor, antes: ant.stack, sobe: true, u: "" },
      { nome: "Spacing", atual: p.spacing_um.valor, antes: ant.spacing, sobe: false, u: "µm" },
    ].filter(
      (c): c is { nome: string; atual: number; antes: number; sobe: boolean; u: string } =>
        c.atual != null && c.antes != null,
    );
    const maisAgressivos = comparacoes.filter((c) =>
      c.sobe ? c.atual > c.antes : c.atual < c.antes,
    );

    if (ant.teveHpi) {
      for (const c of maisAgressivos) {
        avisos.push(
          `Houve mancha na sessão anterior e o valor de ${c.nome} ficou mais agressivo que antes (${c.antes} → ${c.atual}${c.u ? ` ${c.u}` : ""}). Repita ou reduza.`,
        );
      }
    } else {
      if (maisAgressivos.length > 1) {
        avisos.push(
          `${juntarComE(maisAgressivos.map((c) => c.nome))} ficaram mais agressivos ao mesmo tempo. Mude um parâmetro por sessão para saber o que causou cada efeito.`,
        );
      }
      for (const c of maisAgressivos) {
        if (c.antes === 0) continue;
        const variacao = Math.abs(c.atual - c.antes) / c.antes;
        // Stack sobe de 1 em 1: 1 → 2 é +100% e é o passo normal.
        if (c.nome !== "SmartStack" && variacao > 0.25) {
          avisos.push(
            `${c.nome} mudou ${Math.round(variacao * 100)}% em relação à sessão anterior (${c.antes} → ${c.atual}). O passo usual é de 10–20%.`,
          );
        }
      }
      if (ant.resultado === "bom" && maisAgressivos.length > 0) {
        avisos.push(
          "A sessão anterior teve boa melhora: não há motivo para subir parâmetros.",
        );
      }
    }
  }

  // --- Primeira sessão --------------------------------------------------------
  if (entrada.sessao === "primeira" && p.smartstack.valor >= 4) {
    avisos.push(
      `SmartStack ${p.smartstack.valor} na primeira sessão: comece mais baixo e suba conforme a resposta.`,
    );
  }

  return avisos;
}

// ============================================================================
//  Peça focada
// ============================================================================
const MELANOCITICAS: readonly LesaoFocalId[] = ["nevo_dermico"];
const PRE_MALIGNAS: readonly LesaoFocalId[] = [
  "queratose_actinica",
  "queilite_actinica",
  "leucoplasia",
];

function verificarFocada(entrada: EntradaConsulta, rec: Recomendacao): string[] {
  const avisos: string[] = [];
  const f = rec.parametros_focada;
  const lesao = LESOES_FOCAIS.find((l) => l.id === entrada.lesaoFocal);

  if (!lesao) {
    avisos.push("Escolha a lesão na lista da peça focada para conferir com o protocolo.");
  }
  if (lesao && MELANOCITICAS.includes(lesao.id)) {
    avisos.push(
      "Nevo melanocítico: só com diagnóstico clínico e dermatoscópico. A vaporização destrói o material para histologia; na dúvida, biópsia antes.",
    );
  }
  if (lesao && PRE_MALIGNAS.includes(lesao.id)) {
    avisos.push(
      `${lesao.nome} é pré-maligna: exclua carcinoma antes de vaporizar; considere biópsia.`,
    );
  }

  if (rec.viabilidade !== "nao_recomendado" && !f) {
    avisos.push(
      "A IA indicou o tratamento mas não devolveu os parâmetros da peça focada. Gere a consulta de novo.",
    );
  }
  if (!f || !lesao) return avisos;

  // A tabela tem opções diferentes para a mesma lesão (ex.: SP 0,3 W ou CW
  // 3 W na verruga): compara com a opção do mesmo modo, se houver.
  const opcoes = LESOES_FOCAIS.filter((l) => l.nome.split(" (opção")[0] === lesao.nome.split(" (opção")[0]);
  const mesmaModo = opcoes.find((l) => l.modo === f.modo);
  if (!mesmaModo) {
    avisos.push(
      `O protocolo Premium usa ${juntarComE(opcoes.map((o) => o.modo))} para ${lesao.nome.split(" (opção")[0]}; a IA sugeriu ${f.modo}.`,
    );
  } else if (f.potencia_w > mesmaModo.watts * 2) {
    avisos.push(
      `Potência de ${num(f.potencia_w)} W: mais que o dobro do protocolo Premium para ${mesmaModo.nome} em ${f.modo} (${num(mesmaModo.watts)} W).`,
    );
  }
  if (f.modo === "CW" && f.frequencia_hz != null) {
    avisos.push("No CW (contínuo) não há frequência; ignore o valor em Hz.");
  }
  return avisos;
}

/** "a", "a e b", "a, b e c". */
function juntarComE(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}
