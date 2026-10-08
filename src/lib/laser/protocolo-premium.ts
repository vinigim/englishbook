/**
 * Protocolo de parâmetros do treinamento da Premium (autorizada DEKA).
 *
 * Transcrito à mão do PDF "Protocolo_Punto" (4 páginas), lendo as tabelas como
 * imagem — o texto extraído do PDF sai embaralhado. As páginas de ginecologia
 * (MonaLisa Touch, incontinência, líquen, vulva, labioplastia) ficaram de fora
 * de propósito: o recomendador trata só de pele.
 *
 * É a fonte de maior peso da base. Este arquivo é a fonte ÚNICA: os trechos da
 * base de conhecimento e os limites por fototipo das verificações automáticas
 * (guardas.ts) são gerados a partir daqui. Corrigiu um número? Corrija aqui e
 * suba KB_VERSAO.
 *
 * Duas leituras incertas, registradas também no texto que vai para a IA:
 * - A coluna "TIME" não traz unidade. Os valores (300–1.700) só fazem sentido
 *   como dwell em µs, dentro da faixa de 200–2.000 µs do aparelho.
 * - A tabela de pálpebras não tem o título do pulso no documento.
 */

export const PROTOCOLO_FONTE = {
  label: "Protocolo de treinamento Premium (autorizada DEKA)",
  descricao:
    "Tabelas de parâmetros do treinamento da Premium, autorizada da DEKA, para SmartXide DOT, Punto, Touch e SmartXide 2.",
} as const;

export type PulsoProtocolo = "SP" | "DP" | "HP";
export type GrupoFototipo = "1-2" | "3-4" | "5-6";

export type LinhaProtocolo = {
  /** Grupo de fototipo, ou nível (CoolPeel: leve, moderada, severa). */
  grupo: GrupoFototipo | "leve" | "moderada" | "severa";
  watts: number;
  /** Texto como no documento: "2", "3", "2/3 (se profunda)". */
  stack: string;
  /** Em µs. null = coluna vazia no documento (HP e CoolPeel). */
  time: number | null;
  spacing: number;
};

export type BlocoPulso = {
  /** null quando o documento não indica o pulso da tabela. */
  pulso: PulsoProtocolo | null;
  linhas: LinhaProtocolo[];
};

export type SecaoProtocolo = {
  /** Vira o id do trecho na base: `premium-${id}`. Não renomeie. */
  id: string;
  titulo: string;
  /** O que o documento escreve ao lado do título. */
  subtitulo?: string;
  blocos: BlocoPulso[];
  nota?: string;
};

export const PROTOCOLO_PREMIUM: readonly SecaoProtocolo[] = [
  {
    id: "rejuv-suave",
    titulo: "Rejuvenescimento facial suave",
    subtitulo: "Maior ablação com calor em profundidade",
    blocos: [
      {
        pulso: "SP",
        linhas: [
          { grupo: "1-2", watts: 18, stack: "2", time: 1000, spacing: 750 },
          { grupo: "3-4", watts: 16, stack: "2", time: 900, spacing: 800 },
          { grupo: "5-6", watts: 14, stack: "2", time: 800, spacing: 850 },
        ],
      },
      {
        pulso: "DP",
        linhas: [
          { grupo: "1-2", watts: 15, stack: "2", time: 900, spacing: 750 },
          { grupo: "3-4", watts: 10, stack: "2", time: 800, spacing: 800 },
        ],
      },
      {
        pulso: "HP",
        linhas: [{ grupo: "3-4", watts: 5, stack: "1", time: null, spacing: 600 }],
      },
    ],
  },
  {
    id: "palpebras",
    titulo: "Pálpebras",
    blocos: [
      {
        pulso: null,
        linhas: [
          { grupo: "1-2", watts: 15, stack: "2", time: 800, spacing: 700 },
          { grupo: "3-4", watts: 12, stack: "2", time: 700, spacing: 750 },
          { grupo: "5-6", watts: 10, stack: "2", time: 600, spacing: 800 },
        ],
      },
    ],
    nota: "O documento não indica o pulso desta tabela.",
  },
  {
    id: "rejuv-intenso",
    titulo: "Rejuvenescimento facial intenso",
    blocos: [
      {
        pulso: "DP",
        linhas: [
          { grupo: "1-2", watts: 15, stack: "3", time: 1000, spacing: 650 },
          { grupo: "3-4", watts: 10, stack: "3", time: 900, spacing: 750 },
        ],
      },
      {
        pulso: "HP",
        linhas: [{ grupo: "3-4", watts: 10, stack: "2", time: null, spacing: 300 }],
      },
    ],
  },
  {
    id: "acne-cicatriz",
    titulo: "Cicatrizes de acne — aplicação exclusivamente na área da cicatriz",
    blocos: [
      {
        pulso: "DP",
        linhas: [
          { grupo: "1-2", watts: 10, stack: "2/3 (se profunda)", time: 800, spacing: 300 },
          { grupo: "3-4", watts: 10, stack: "2/3 (se profunda)", time: 700, spacing: 300 },
        ],
      },
      {
        pulso: "HP",
        linhas: [{ grupo: "3-4", watts: 10, stack: "2", time: null, spacing: 300 }],
      },
    ],
  },
  {
    id: "acne-resurfacing",
    titulo: "Cicatrizes de acne — resurfacing",
    blocos: [
      {
        pulso: "DP",
        linhas: [
          { grupo: "1-2", watts: 20, stack: "3", time: 1100, spacing: 600 },
          { grupo: "3-4", watts: 15, stack: "3", time: 800, spacing: 700 },
        ],
      },
      {
        pulso: "HP",
        linhas: [{ grupo: "3-4", watts: 10, stack: "2", time: null, spacing: 500 }],
      },
    ],
  },
  {
    id: "corporal-suave",
    titulo: "Rejuvenescimento corporal suave — pescoço, colo, mãos, braços e estrias vermelhas",
    subtitulo: "Pouca ablação com calor em profundidade",
    blocos: [
      {
        pulso: "SP",
        linhas: [
          { grupo: "1-2", watts: 15, stack: "2", time: 800, spacing: 800 },
          { grupo: "3-4", watts: 12, stack: "2", time: 700, spacing: 850 },
          { grupo: "5-6", watts: 10, stack: "2", time: 600, spacing: 900 },
        ],
      },
    ],
  },
  {
    id: "corporal-forte",
    titulo: "Rejuvenescimento corporal forte — cicatrizes atróficas e estrias brancas",
    blocos: [
      {
        pulso: "DP",
        linhas: [
          { grupo: "1-2", watts: 12, stack: "3", time: 900, spacing: 750 },
          { grupo: "3-4", watts: 10, stack: "3", time: 800, spacing: 800 },
          { grupo: "5-6", watts: 8, stack: "3", time: 700, spacing: 850 },
        ],
      },
    ],
    nota: "O documento marca esta tabela como intensa.",
  },
  {
    id: "manchas",
    titulo: "Manchas e melanoses",
    subtitulo: "Maior ablação com pouco calor",
    blocos: [
      {
        pulso: "SP",
        linhas: [
          { grupo: "1-2", watts: 25, stack: "2", time: 300, spacing: 250 },
          { grupo: "3-4", watts: 22, stack: "2", time: 300, spacing: 300 },
          { grupo: "5-6", watts: 20, stack: "2", time: 300, spacing: 350 },
        ],
      },
      {
        pulso: "DP",
        linhas: [
          { grupo: "1-2", watts: 20, stack: "2", time: 300, spacing: 200 },
          { grupo: "3-4", watts: 18, stack: "2", time: 300, spacing: 250 },
          { grupo: "5-6", watts: 15, stack: "2", time: 300, spacing: 300 },
        ],
      },
      {
        pulso: "HP",
        linhas: [
          { grupo: "1-2", watts: 7, stack: "1", time: null, spacing: 200 },
          { grupo: "3-4", watts: 5, stack: "1", time: null, spacing: 250 },
          { grupo: "5-6", watts: 4, stack: "1", time: null, spacing: 300 },
        ],
      },
    ],
  },
  {
    id: "hipertroficas",
    titulo: "Cicatrizes hipertróficas",
    subtitulo: "Maior ablação com pouco calor",
    blocos: [
      {
        pulso: "HP",
        linhas: [
          { grupo: "1-2", watts: 10, stack: "2/3", time: null, spacing: 200 },
          { grupo: "3-4", watts: 8, stack: "2/3", time: null, spacing: 250 },
          { grupo: "5-6", watts: 6, stack: "2/3", time: null, spacing: 300 },
        ],
      },
    ],
  },
  {
    id: "coolpeel",
    titulo: "Protocolo CoolPeel (fototipos 1 a 6)",
    subtitulo: "Minimamente ablativo, tempo de recuperação mínimo",
    blocos: [
      {
        pulso: "HP",
        linhas: [
          { grupo: "leve", watts: 1.5, stack: "1", time: null, spacing: 950 },
          { grupo: "moderada", watts: 2.5, stack: "1", time: null, spacing: 950 },
          { grupo: "severa", watts: 4, stack: "1", time: null, spacing: 950 },
        ],
      },
    ],
    nota: "Acionar modo spray, varredura SmartTrack, repetição 1 segundo.",
  },
];

// ============================================================================
//  Peça focada (sem scanner) — página 4 do documento
// ============================================================================
export const LESOES_FOCAIS = [
  { id: "adenoma_sebaceo", nome: "Adenoma sebáceo", modo: "SP", watts: 0.5, hz: 10 },
  { id: "condrodermatite", nome: "Condrodermatite nodular da hélice", modo: "SP", watts: 0.1, hz: 10 },
  { id: "cicatriz_acne", nome: "Cicatrizes de acne (focal)", modo: "HP", watts: 0.1, hz: 5 },
  { id: "condiloma_1", nome: "Condiloma acuminado (opção 1)", modo: "SP", watts: 0.5, hz: 10 },
  { id: "condiloma_2", nome: "Condiloma acuminado (opção 2)", modo: "CW", watts: 4, hz: null },
  { id: "discromias_superficiais", nome: "Discromias superficiais", modo: "HP", watts: 0.1, hz: 5 },
  { id: "favre_racouchot", nome: "Doença de Favre-Racouchot", modo: "SP", watts: 0.1, hz: 10 },
  { id: "pringle_bourneville", nome: "Doença de Pringle-Bourneville", modo: "HP", watts: 0.3, hz: 5 },
  { id: "fibroma_mole", nome: "Fibroma mole", modo: "HP", watts: 0.1, hz: 5 },
  { id: "hidrocistoma", nome: "Hidrocistoma apócrino", modo: "SP", watts: 0.1, hz: 10 },
  { id: "leucoplasia", nome: "Leucoplasia", modo: "SP", watts: 0.1, hz: 10 },
  { id: "milium", nome: "Milium", modo: "HP", watts: 0.1, hz: 5 },
  { id: "neurofibroma", nome: "Neurofibroma", modo: "HP", watts: 0.1, hz: 5 },
  { id: "nevo_dermico", nome: "Nevo dérmico", modo: "SP", watts: 0.1, hz: 10 },
  { id: "nevo_epidermico", nome: "Nevo epidérmico", modo: "SP", watts: 0.1, hz: 10 },
  { id: "nevo_sebaceo", nome: "Nevo sebáceo", modo: "SP", watts: 0.3, hz: 10 },
  { id: "otofima", nome: "Otofima", modo: "SP", watts: 0.3, hz: 10 },
  { id: "papilomatose_oral", nome: "Papilomatose oral", modo: "SP", watts: 0.1, hz: 20 },
  { id: "papulas_peroladas", nome: "Pápulas peroladas", modo: "SP", watts: 0.1, hz: 10 },
  { id: "queilite_actinica", nome: "Queilite actínica", modo: "SP", watts: 0.1, hz: 10 },
  { id: "queratose_actinica", nome: "Queratose actínica", modo: "SP", watts: 0.1, hz: 10 },
  { id: "queratose_seborreica_pequena_1", nome: "Queratose seborreica < 0,5 cm (opção 1)", modo: "HP", watts: 0.1, hz: 5 },
  { id: "queratose_seborreica_grande_1", nome: "Queratose seborreica > 0,5 cm (opção 1)", modo: "SP", watts: 0.1, hz: 10 },
  { id: "queratose_seborreica_grande_2", nome: "Queratose seborreica > 0,5 cm (opção 2)", modo: "CW", watts: 7, hz: null },
  { id: "rinofima_1", nome: "Rinofima glandular (opção 1)", modo: "SP", watts: 0.9, hz: 10 },
  { id: "rinofima_2", nome: "Rinofima glandular (opção 2)", modo: "CW", watts: 5, hz: null },
  { id: "siringoma", nome: "Siringoma", modo: "HP", watts: 0.1, hz: 5 },
  { id: "tricoepitelioma", nome: "Tricoepitelioma", modo: "SP", watts: 0.1, hz: 10 },
  { id: "verruga_comum_1", nome: "Verruga comum (opção 1)", modo: "SP", watts: 0.3, hz: 10 },
  { id: "verruga_comum_2", nome: "Verruga comum (opção 2)", modo: "CW", watts: 3, hz: null },
] as const;

export type LesaoFocal = (typeof LESOES_FOCAIS)[number];
export type LesaoFocalId = LesaoFocal["id"];
export const LESOES_FOCAIS_IDS = LESOES_FOCAIS.map((l) => l.id) as [
  LesaoFocalId,
  ...LesaoFocalId[],
];

// ============================================================================
//  Texto para a base de conhecimento
// ============================================================================
/** 0.1 → "0,1": número como se escreve em português. */
export function num(v: number): string {
  return String(v).replace(".", ",");
}

const GRUPO_LABEL: Record<LinhaProtocolo["grupo"], string> = {
  "1-2": "Fototipo 1 e 2",
  "3-4": "Fototipo 3 e 4",
  "5-6": "Fototipo 5 e 6",
  leve: "Leve",
  moderada: "Moderada",
  severa: "Severa",
};

const PULSO_LABEL: Record<PulsoProtocolo, string> = {
  SP: "SP — Smart Pulse",
  DP: "DP — Deka Pulse",
  HP: "HP — High Pulse",
};

export function textoSecao(s: SecaoProtocolo): string {
  const blocos = s.blocos.map((b) => {
    const cabecalho = b.pulso ? PULSO_LABEL[b.pulso] : "Pulso não indicado no documento";
    const linhas = b.linhas.map(
      (l) =>
        `- ${GRUPO_LABEL[l.grupo]}: ${num(l.watts)} W · stack ${l.stack} · time ${
          l.time != null ? `${l.time} µs` : "— (não se ajusta)"
        } · spacing ${l.spacing} µm`,
    );
    return `${cabecalho}\n${linhas.join("\n")}`;
  });
  const sub = s.subtitulo ? `(${s.subtitulo})\n` : "";
  const nota = s.nota ? `\nObservação do documento: ${s.nota}` : "";
  return `${sub}${blocos.join("\n")}${nota}`;
}

export function textoLesoesFocais(): string {
  return LESOES_FOCAIS.map(
    (l) => `- ${l.nome}: ${l.modo} · ${num(l.watts)} W · ${l.hz != null ? `${l.hz} Hz` : "contínuo"}`,
  ).join("\n");
}

// ============================================================================
//  Limites por fototipo, derivados das tabelas
//  ----------------------------------------------------------------------------
//  Usados pelas verificações automáticas: um valor além do que o protocolo usa
//  para aquele grupo de fototipo, em QUALQUER indicação, merece aviso.
// ============================================================================
export type LimitesGrupo = {
  wattsMax: number;
  timeMax: number;
  spacingMin: number;
  stackMax: number;
};

export function grupoDoFototipo(f: "I" | "II" | "III" | "IV" | "V" | "VI"): GrupoFototipo {
  if (f === "I" || f === "II") return "1-2";
  if (f === "III" || f === "IV") return "3-4";
  return "5-6";
}

/** O maior stack de um texto como "2/3 (se profunda)". */
function stackMax(texto: string): number {
  return Math.max(...(texto.match(/\d+/g) ?? ["1"]).map(Number));
}

export function limitesDoGrupo(g: GrupoFototipo): LimitesGrupo {
  const linhas = PROTOCOLO_PREMIUM.flatMap((s) => s.blocos.flatMap((b) => b.linhas)).filter(
    (l) => l.grupo === g,
  );
  return {
    wattsMax: Math.max(...linhas.map((l) => l.watts)),
    timeMax: Math.max(...linhas.map((l) => l.time ?? 0)),
    spacingMin: Math.min(...linhas.map((l) => l.spacing)),
    stackMax: Math.max(...linhas.map((l) => stackMax(l.stack))),
  };
}
