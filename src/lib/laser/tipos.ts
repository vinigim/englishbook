/**
 * Vocabulário do recomendador de parâmetros do SmartXide Punto.
 *
 * Mora separado do resto de src/lib/laser porque o formulário é client
 * component: importar daqui não arrasta o SDK da Anthropic nem a base de
 * conhecimento para o bundle do navegador.
 */

// ============================================================================
//  Entrada
// ============================================================================
export const INDICACOES = [
  "rejuvenescimento_leve",
  "rejuvenescimento_moderado",
  "rejuvenescimento_intenso",
  "cicatriz_acne_rolling",
  "cicatriz_acne_boxcar",
  "cicatriz_acne_icepick",
  "cicatriz_cirurgica_traumatica",
  "estrias_rubras",
  "estrias_albas",
  "lesoes_pigmentadas",
  "melasma",
  "poros_textura",
  "flacidez_palpebral",
  "queratoses_actinicas",
  "outra",
] as const;
export type Indicacao = (typeof INDICACOES)[number];

export const INDICACAO_LABEL: Record<Indicacao, string> = {
  rejuvenescimento_leve: "Rejuvenescimento leve (textura, linhas finas)",
  rejuvenescimento_moderado: "Rejuvenescimento moderado (rugas, fotoenvelhecimento)",
  rejuvenescimento_intenso: "Rejuvenescimento intenso (rugas profundas)",
  cicatriz_acne_rolling: "Cicatriz de acne — rolling",
  cicatriz_acne_boxcar: "Cicatriz de acne — boxcar",
  cicatriz_acne_icepick: "Cicatriz de acne — icepick",
  cicatriz_cirurgica_traumatica: "Cicatriz cirúrgica ou traumática",
  estrias_rubras: "Estrias rubras (recentes)",
  estrias_albas: "Estrias albas (antigas)",
  lesoes_pigmentadas: "Manchas e lentigos solares",
  melasma: "Melasma",
  poros_textura: "Poros dilatados e textura",
  flacidez_palpebral: "Flacidez palpebral",
  queratoses_actinicas: "Queratoses actínicas (campo cancerizável)",
  outra: "Outra (descrever nas observações)",
};

export const REGIOES = [
  "face_total",
  "fronte",
  "malar",
  "periorbital",
  "perioral",
  "nariz",
  "pescoco",
  "colo",
  "maos",
  "bracos",
  "abdome",
  "coxas_gluteos",
  "dorso",
] as const;
export type Regiao = (typeof REGIOES)[number];

export const REGIAO_LABEL: Record<Regiao, string> = {
  face_total: "Face total",
  fronte: "Fronte",
  malar: "Região malar (bochechas)",
  periorbital: "Periorbital / pálpebras",
  perioral: "Perioral / lábios",
  nariz: "Nariz",
  pescoco: "Pescoço",
  colo: "Colo",
  maos: "Dorso das mãos",
  bracos: "Braços",
  abdome: "Abdome",
  coxas_gluteos: "Coxas e glúteos",
  dorso: "Dorso (costas)",
};

export const FOTOTIPOS = ["I", "II", "III", "IV", "V", "VI"] as const;
export type Fototipo = (typeof FOTOTIPOS)[number];

export const FOTOTIPO_LABEL: Record<Fototipo, string> = {
  I: "I — sempre queima, nunca bronzeia",
  II: "II — queima fácil, bronzeia pouco",
  III: "III — queima moderado, bronzeia gradual",
  IV: "IV — queima pouco, bronzeia fácil",
  V: "V — raramente queima, pele morena escura",
  VI: "VI — nunca queima, pele negra",
};

export const GRAVIDADES = ["leve", "moderada", "grave"] as const;
export type Gravidade = (typeof GRAVIDADES)[number];

export const DOWNTIMES = ["minimo", "moderado", "maximo_resultado"] as const;
export type Downtime = (typeof DOWNTIMES)[number];

export const DOWNTIME_LABEL: Record<Downtime, string> = {
  minimo: "Mínimo (2–3 dias) — volta logo à rotina",
  moderado: "Moderado (5–7 dias)",
  maximo_resultado: "Aceita mais dias em troca de mais resultado",
};

export const SESSOES = ["primeira", "subsequente"] as const;
export type Sessao = (typeof SESSOES)[number];

/**
 * Histórico clínico.
 *
 * As duas primeiras bloqueiam a consulta antes de chamar a IA (ver
 * BLOQUEIOS em ./guardas.ts). O resto vai para o modelo como fator de risco.
 */
export const HISTORICOS = [
  "gestacao",
  "infeccao_ativa_area",
  "isotretinoina_6m",
  "herpes_recorrente",
  "queloide_hipertrofica",
  "bronzeado_recente",
  "melasma_associado",
  "vitiligo_psoriase",
  "anticoagulante",
  "diabetes_descompensado",
  "imunossupressao",
  "tabagismo",
  "radioterapia_area",
  "lactacao",
  "hiperpigmentacao_pos_inflamatoria_previa",
  "procedimento_recente_area",
  "retinoide_topico_em_uso",
  "medicacao_fotossensibilizante",
] as const;
export type Historico = (typeof HISTORICOS)[number];

export const HISTORICO_LABEL: Record<Historico, string> = {
  gestacao: "Gestante",
  infeccao_ativa_area: "Infecção ativa na área (herpes, bacteriana, fúngica)",
  isotretinoina_6m: "Isotretinoína oral nos últimos 6 meses",
  herpes_recorrente: "Herpes labial recorrente",
  queloide_hipertrofica: "Histórico de queloide ou cicatriz hipertrófica",
  bronzeado_recente: "Bronzeado ou exposição solar intensa recente",
  melasma_associado: "Tem melasma (mesmo não sendo a queixa)",
  vitiligo_psoriase: "Vitiligo ou psoríase ativos",
  anticoagulante: "Usa anticoagulante ou antiagregante",
  diabetes_descompensado: "Diabetes descompensado",
  imunossupressao: "Imunossupressão",
  tabagismo: "Tabagista",
  radioterapia_area: "Radioterapia prévia na área",
  lactacao: "Lactante",
  hiperpigmentacao_pos_inflamatoria_previa:
    "Já teve mancha (HPI) após procedimento",
  procedimento_recente_area:
    "Peeling, laser ou preenchimento na área nas últimas 4 semanas",
  retinoide_topico_em_uso: "Usa retinoide tópico ou ácidos na área",
  medicacao_fotossensibilizante:
    "Usa medicação fotossensibilizante (ex.: doxiciclina, tetraciclinas)",
};

// ============================================================================
//  Perguntas que só aparecem para algumas indicações
// ============================================================================
export const TIPOS_MELASMA = ["epidermico", "dermico", "misto", "nao_sei"] as const;
export type TipoMelasma = (typeof TIPOS_MELASMA)[number];

export const TIPO_MELASMA_LABEL: Record<TipoMelasma, string> = {
  epidermico: "Epidérmico (realça na luz de Wood)",
  dermico: "Dérmico",
  misto: "Misto",
  nao_sei: "Não avaliado",
};

export const IDADES_CICATRIZ = ["menos_6m", "6_12m", "mais_12m"] as const;
export type IdadeCicatriz = (typeof IDADES_CICATRIZ)[number];

export const IDADE_CICATRIZ_LABEL: Record<IdadeCicatriz, string> = {
  menos_6m: "Menos de 6 meses",
  "6_12m": "6 a 12 meses",
  mais_12m: "Mais de 12 meses",
};

export function ehMelasma(i: Indicacao): boolean {
  return i === "melasma";
}

export function ehCicatriz(i: Indicacao): boolean {
  return i.startsWith("cicatriz_");
}

// ============================================================================
//  A pele e o contexto
// ============================================================================
export const EXTENSOES = ["regiao_inteira", "lesoes_isoladas"] as const;
export type Extensao = (typeof EXTENSOES)[number];

export const EXTENSAO_LABEL: Record<Extensao, string> = {
  regiao_inteira: "A região inteira",
  lesoes_isoladas: "Lesões isoladas dentro da região",
};

export const CARACTERISTICAS_PELE = [
  "oleosa_espessa",
  "fina_atrofica",
  "sensivel_rosacea",
  "acne_ativa",
  "fotodano_intenso",
] as const;
export type CaracteristicaPele = (typeof CARACTERISTICAS_PELE)[number];

export const CARACTERISTICA_PELE_LABEL: Record<CaracteristicaPele, string> = {
  oleosa_espessa: "Oleosa e espessa",
  fina_atrofica: "Fina ou atrófica",
  sensivel_rosacea: "Sensível ou com rosácea",
  acne_ativa: "Acne inflamatória ativa na área",
  fotodano_intenso: "Fotodano intenso",
};

export const EXPOSICOES_SOLARES = ["baixa", "moderada", "alta"] as const;
export type ExposicaoSolar = (typeof EXPOSICOES_SOLARES)[number];

export const EXPOSICAO_SOLAR_LABEL: Record<ExposicaoSolar, string> = {
  baixa: "Baixa — rotina em ambiente fechado",
  moderada: "Moderada — deslocamentos, algum sol",
  alta: "Alta — trabalha ao sol, praia ou viagem prevista",
};

export const ASSOCIACOES = [
  "drug_delivery_txa",
  "drug_delivery_outros",
  "subcisao",
  "prp",
  "corticoide_intralesional",
  "tca_cross",
] as const;
export type Associacao = (typeof ASSOCIACOES)[number];

export const ASSOCIACAO_LABEL: Record<Associacao, string> = {
  drug_delivery_txa: "Aplicar ácido tranexâmico logo após o laser",
  drug_delivery_outros: "Aplicar outro ativo logo após (vitamina C, exossomos…)",
  subcisao: "Subcisão",
  prp: "PRP",
  corticoide_intralesional: "Corticoide na cicatriz",
  tca_cross: "TCA CROSS",
};

export const RESULTADOS_ANTERIORES = ["bom", "parcial", "sem_melhora"] as const;
export type ResultadoAnterior = (typeof RESULTADOS_ANTERIORES)[number];

export const RESULTADO_ANTERIOR_LABEL: Record<ResultadoAnterior, string> = {
  bom: "Boa melhora",
  parcial: "Melhora parcial",
  sem_melhora: "Sem melhora",
};

/** O que se sabe da última sessão. Tudo opcional: nem sempre há o registro. */
export type SessaoAnterior = {
  potencia: number | null;
  dwell: number | null;
  spacing: number | null;
  stack: number | null;
  diasEritema: number | null;
  teveHpi: boolean;
  resultado: ResultadoAnterior | null;
};

export const SESSAO_ANTERIOR_VAZIA: SessaoAnterior = {
  potencia: null,
  dwell: null,
  spacing: null,
  stack: null,
  diasEritema: null,
  teveHpi: false,
  resultado: null,
};

export type EntradaConsulta = {
  indicacao: Indicacao;
  /** Só para melasma. */
  melasmaTipo: TipoMelasma | null;
  /** Só para melasma: já fez ≥ 3 meses de tratamento tópico sem resposta? */
  melasmaRefratario: boolean | null;
  /** Só para cicatrizes. */
  idadeCicatriz: IdadeCicatriz | null;
  regiao: Regiao;
  extensao: Extensao;
  gravidade: Gravidade;
  fototipo: Fototipo;
  idade: number | null;
  caracteristicasPele: CaracteristicaPele[];
  historico: Historico[];
  sessao: Sessao;
  /** Só faz sentido quando `sessao` é "subsequente". */
  sessaoAnterior: SessaoAnterior | null;
  /** Texto livre sobre a sessão anterior, complementar aos campos acima. */
  respostaAnterior: string;
  associacoes: Associacao[];
  downtime: Downtime;
  exposicaoSolar: ExposicaoSolar;
  observacoes: string;
};

export const ENTRADA_PADRAO: EntradaConsulta = {
  indicacao: "rejuvenescimento_moderado",
  melasmaTipo: null,
  melasmaRefratario: null,
  idadeCicatriz: null,
  regiao: "face_total",
  extensao: "regiao_inteira",
  gravidade: "moderada",
  fototipo: "III",
  idade: null,
  caracteristicasPele: [],
  historico: [],
  sessao: "primeira",
  sessaoAnterior: null,
  respostaAnterior: "",
  associacoes: [],
  downtime: "moderado",
  exposicaoSolar: "baixa",
  observacoes: "",
};

/**
 * Zera o que não se aplica e ordena as listas.
 *
 * Usada no hash e no prompt: um campo de melasma esquecido preenchido numa
 * consulta de estrias não pode mudar a resposta nem o reaproveitamento. Também
 * completa consultas gravadas antes de os campos novos existirem.
 */
export function normalizarEntrada(
  parcial: Partial<EntradaConsulta>,
): EntradaConsulta {
  const e: EntradaConsulta = { ...ENTRADA_PADRAO, ...parcial };
  const melasma = ehMelasma(e.indicacao);
  const subsequente = e.sessao === "subsequente";
  return {
    ...e,
    melasmaTipo: melasma ? (e.melasmaTipo ?? "nao_sei") : null,
    melasmaRefratario: melasma ? (e.melasmaRefratario ?? false) : null,
    idadeCicatriz: ehCicatriz(e.indicacao) ? e.idadeCicatriz : null,
    sessaoAnterior: subsequente
      ? { ...SESSAO_ANTERIOR_VAZIA, ...(e.sessaoAnterior ?? {}) }
      : null,
    respostaAnterior: subsequente ? e.respostaAnterior.trim() : "",
    caracteristicasPele: [...new Set(e.caracteristicasPele)].sort(),
    historico: [...new Set(e.historico)].sort(),
    associacoes: [...new Set(e.associacoes)].sort(),
    observacoes: e.observacoes.trim(),
  };
}

// ============================================================================
//  Saída
// ============================================================================
export const MODOS_EMISSAO = ["SP", "DP", "HP"] as const;
export type ModoEmissao = (typeof MODOS_EMISSAO)[number];

export const MODOS_VARREDURA = ["SmartTrack", "Interlaced", "Normal"] as const;
export type ModoVarredura = (typeof MODOS_VARREDURA)[number];

export const VIABILIDADES = [
  "indicado",
  "indicado_com_ressalvas",
  "nao_recomendado",
] as const;
export type Viabilidade = (typeof VIABILIDADES)[number];

export const VIABILIDADE_LABEL: Record<Viabilidade, string> = {
  indicado: "Indicado",
  indicado_com_ressalvas: "Indicado com ressalvas",
  nao_recomendado: "Não recomendado",
};

export const CONFIANCAS = ["alta", "media", "baixa"] as const;
export type Confianca = (typeof CONFIANCAS)[number];

export type ParametroNumerico = {
  valor: number;
  faixa_min: number;
  faixa_max: number;
  motivo: string;
};

export type Recomendacao = {
  viabilidade: Viabilidade;
  resumo: string;
  alertas: string[];
  parametros: {
    modo_emissao: { valor: ModoEmissao; motivo: string };
    potencia_w: ParametroNumerico;
    dwell_time_us: ParametroNumerico;
    spacing_um: ParametroNumerico;
    smartstack: ParametroNumerico;
    modo_varredura: { valor: ModoVarredura; motivo: string };
    forma_area: { valor: string; motivo: string };
    passadas: { valor: number; motivo: string };
  } | null;
  protocolo: {
    sessoes: string;
    intervalo: string;
    teste_previo: string;
    como_progredir: string;
  };
  cuidados_pre: string[];
  cuidados_pos: string[];
  alternativas: string[];
  fontes: string[];
  confianca: Confianca;
  motivo_confianca: string;
  /** O que a IA queria saber e não sabia, quando mudaria a recomendação. */
  perguntas_pendentes: string[];
};

/** O que a rota devolve à tela. */
export type RespostaConsulta = {
  id: string | null;
  recomendacao: Recomendacao;
  /** Avisos que o código acrescentou depois de conferir a resposta da IA. */
  verificacoes: string[];
  /** Preenchido quando a consulta foi barrada antes de chegar à IA. */
  bloqueadoPor: string | null;
  reaproveitada: boolean;
  model: string | null;
  costUsd: number;
};
