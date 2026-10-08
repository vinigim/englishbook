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
  "rejuvenescimento",
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
  rejuvenescimento: "Rejuvenescimento e fotoenvelhecimento",
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

/**
 * Escala de grau de cada indicação.
 *
 * "Leve, moderada, grave" sem régua não quer dizer nada: cicatriz de acne
 * grave e melasma grave são coisas diferentes, e duas pessoas marcavam o
 * mesmo caso de jeitos diferentes. Cada indicação tem a sua escala, com a
 * descrição de cada nível na tela. Indicação sem escala (null) não pergunta
 * grau: nela a gravidade pesa pouco nos parâmetros.
 *
 * Os `valor` são gravados nas consultas: não renomeie.
 */
export type OpcaoGrau = { valor: string; rotulo: string; descricao: string };
export type Escala = { nome: string; pergunta: string; opcoes: OpcaoGrau[] };

const GOODMAN_BARON: Escala = {
  nome: "Goodman & Baron",
  pergunta: "Grau das cicatrizes (Goodman & Baron)",
  opcoes: [
    { valor: "1", rotulo: "1 — Macular", descricao: "Só mancha (eritema ou pigmento), sem relevo." },
    { valor: "2", rotulo: "2 — Leve", descricao: "Não aparece à distância social; a maquiagem cobre." },
    { valor: "3", rotulo: "3 — Moderada", descricao: "Aparece à distância social; a maquiagem não cobre, mas se nivela ao esticar a pele." },
    { valor: "4", rotulo: "4 — Grave", descricao: "Aparece à distância e não se nivela ao esticar a pele." },
  ],
};

const ESTRIAS: Escala = {
  nome: "largura e quantidade",
  pergunta: "Como são as estrias",
  opcoes: [
    { valor: "finas_poucas", rotulo: "Finas e poucas", descricao: "Estreitas, em pequeno número." },
    { valor: "largas_ou_numerosas", rotulo: "Largas ou numerosas", descricao: "Uma das duas coisas: largas, ou muitas." },
    { valor: "largas_e_numerosas", rotulo: "Largas e numerosas", descricao: "Largas, muitas e com atrofia evidente da pele." },
  ],
};

export const ESCALAS: Record<Indicacao, Escala | null> = {
  rejuvenescimento: {
    nome: "Glogau",
    pergunta: "Grau de fotoenvelhecimento (Glogau)",
    opcoes: [
      { valor: "I", rotulo: "I — Sem rugas", descricao: "Fotodano inicial: discromia leve, textura, linhas finas." },
      { valor: "II", rotulo: "II — Rugas em movimento", descricao: "Rugas só com a mímica; lentigos iniciais." },
      { valor: "III", rotulo: "III — Rugas em repouso", descricao: "Rugas visíveis parado; discromia e telangiectasias." },
      { valor: "IV", rotulo: "IV — Só rugas", descricao: "Rugas por toda a face; pele amarelada ou acinzentada, lesões actínicas." },
    ],
  },
  cicatriz_acne_rolling: GOODMAN_BARON,
  cicatriz_acne_boxcar: GOODMAN_BARON,
  cicatriz_acne_icepick: GOODMAN_BARON,
  cicatriz_cirurgica_traumatica: {
    nome: "aspecto da cicatriz",
    pergunta: "Como é a cicatriz",
    opcoes: [
      { valor: "plana", rotulo: "Plana", descricao: "No nível da pele; incomoda a cor ou a textura." },
      { valor: "elevada", rotulo: "Elevada (hipertrófica)", descricao: "Acima da pele, dentro dos limites da lesão original." },
      { valor: "deprimida", rotulo: "Deprimida (atrófica)", descricao: "Abaixo do nível da pele." },
      { valor: "retracao", rotulo: "Com retração ou aderência", descricao: "Repuxa a pele ao redor ou limita o movimento." },
    ],
  },
  estrias_rubras: ESTRIAS,
  estrias_albas: ESTRIAS,
  lesoes_pigmentadas: null,
  melasma: {
    nome: "extensão e intensidade",
    pergunta: "Extensão e intensidade do melasma",
    opcoes: [
      { valor: "leve", rotulo: "Leve", descricao: "Manchas claras numa área pequena." },
      { valor: "moderado", rotulo: "Moderado", descricao: "Manchas evidentes numa ou duas áreas (ex.: malar)." },
      { valor: "grave", rotulo: "Grave", descricao: "Manchas escuras e extensas em várias áreas da face." },
    ],
  },
  poros_textura: null,
  flacidez_palpebral: null,
  queratoses_actinicas: null,
  outra: null,
};

export function opcaoGrau(i: Indicacao, grau: string | null): OpcaoGrau | null {
  if (!grau) return null;
  return ESCALAS[i]?.opcoes.find((o) => o.valor === grau) ?? null;
}

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
  /** Valor da escala da indicação (ver ESCALAS); null = não informado ou sem escala. */
  grau: string | null;
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
  indicacao: "rejuvenescimento",
  melasmaTipo: null,
  melasmaRefratario: null,
  idadeCicatriz: null,
  regiao: "face_total",
  extensao: "regiao_inteira",
  grau: null,
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
    // Grau de outra escala (trocou a indicação depois de marcar) não vale.
    grau: opcaoGrau(e.indicacao, e.grau)?.valor ?? null,
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
  /** Leitura das fotos enviadas; null quando não houve foto. */
  analise_foto: AnaliseFoto | null;
};

export type AnaliseFoto = {
  /** O que se vê, por área. */
  achados: string[];
  /** Onde a foto contradiz o formulário, e o que a IA fez com isso. */
  divergencias: string[];
  /** O que a foto não permitiu avaliar (luz, ângulo, foco, maquiagem). */
  limitacoes: string[];
};

/** Limites do envio de fotos, usados na tela e na rota. */
export const FOTOS_MAX = 3;
/** Lado maior, em px: acima disso o modelo reduz a imagem de qualquer jeito. */
export const FOTO_LADO_MAX = 1568;
/**
 * Teto por foto já comprimida. 3 × 1,2 MB cabe nos 4,5 MB que a Vercel aceita
 * por requisição; uma foto de 1568 px em JPEG costuma ter 300–600 KB.
 */
export const FOTO_BYTES_MAX = 1_200_000;

/** A locação da agenda à qual a consulta está ligada. */
export type VinculoLocacao = {
  id: string;
  /** rentals.client — o médico ou a clínica que alugou. */
  medico: string;
  /** yyyy-mm-dd */
  data: string;
  equipamento: string | null;
  especialidade: string | null;
};

/** O que o médico de fato usou, que pode diferir da recomendação. */
export type ParametrosRealizados = {
  modo: ModoEmissao | null;
  potencia: number | null;
  dwell: number | null;
  spacing: number | null;
  stack: number | null;
  varredura: ModoVarredura | null;
  passadas: number | null;
  notas: string;
  /** ISO; preenchido pelo servidor ao gravar. */
  registradoEm: string | null;
};

/** O que a rota devolve à tela. */
export type RespostaConsulta = {
  id: string | null;
  locacao: VinculoLocacao | null;
  realizado: ParametrosRealizados | null;
  recomendacao: Recomendacao;
  /** Avisos que o código acrescentou depois de conferir a resposta da IA. */
  verificacoes: string[];
  /** Preenchido quando a consulta foi barrada antes de chegar à IA. */
  bloqueadoPor: string | null;
  reaproveitada: boolean;
  model: string | null;
  costUsd: number;
};

/** Uma consulta gravada, como a tela lista. */
export type ConsultaGravada = {
  createdAt: string;
  entrada: EntradaConsulta;
  resposta: RespostaConsulta;
};

/** Os parâmetros recomendados, como ponto de partida do registro do realizado. */
export function realizadoAPartirDe(rec: Recomendacao): ParametrosRealizados {
  const p = rec.parametros;
  return {
    modo: p?.modo_emissao.valor ?? null,
    potencia: p?.potencia_w.valor ?? null,
    dwell: p?.dwell_time_us.valor ?? null,
    spacing: p?.spacing_um.valor ?? null,
    stack: p?.smartstack.valor ?? null,
    varredura: p?.modo_varredura.valor ?? null,
    passadas: p?.passadas.valor ?? null,
    notas: "",
    registradoEm: null,
  };
}
