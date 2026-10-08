import { z } from "zod";
import { LESOES_FOCAIS_IDS } from "./protocolo-premium";
import {
  ACHADOS_FOTO,
  ASSOCIACOES,
  CARACTERISTICAS_PELE,
  CONFIANCAS,
  DOWNTIMES,
  EXPOSICOES_SOLARES,
  EXTENSOES,
  IDADES_CICATRIZ,
  RESULTADOS_ANTERIORES,
  TIPOS_MELASMA,
  FOTOTIPOS,
  HISTORICOS,
  INDICACOES,
  MODOS_EMISSAO,
  MODOS_FOCADA,
  MODOS_VARREDURA,
  REGIOES,
  SESSOES,
  VIABILIDADES,
} from "./tipos";

/**
 * Formato da recomendação.
 *
 * O JSON schema é o `input_schema` da ferramenta "entregar_recomendacao"
 * (ver recomendar.ts), não `output_config.format`: como saída estruturada, a
 * gramática compilada passou do limite da API. Sem gramática, o schema guia a
 * IA e o zod ao lado é quem garante o formato. Limites numéricos (potência
 * máxima etc.) ficam em ./guardas.ts, no código.
 */

const numerico = (descricao: string) =>
  ({
    type: "object",
    properties: {
      valor: { type: "number", description: descricao },
      faixa_min: {
        type: "number",
        description: "Menor valor razoável para este caso, na mesma unidade.",
      },
      faixa_max: {
        type: "number",
        description: "Maior valor razoável para este caso, na mesma unidade.",
      },
      motivo: {
        type: "string",
        description:
          "Por que este valor, em 1 a 3 frases, ligando-o à indicação, à região e ao fototipo.",
      },
    },
    required: ["valor", "faixa_min", "faixa_max", "motivo"],
    additionalProperties: false,
  }) as const;

const PARAMETROS_JSON_SCHEMA = {
  type: "object",
  properties: {
    modo_emissao: {
      type: "object",
      properties: {
        valor: { type: "string", enum: [...MODOS_EMISSAO] },
        motivo: { type: "string" },
      },
      required: ["valor", "motivo"],
      additionalProperties: false,
    },
    potencia_w: numerico("Potência em watts."),
    // Sem união aqui de propósito: anyOf dentro de outro anyOf (o de
    // "parametros") estourou o limite de complexidade das saídas estruturadas
    // — a API respondia 400. No HP o modelo manda 0, e o zod abaixo converte
    // para null.
    dwell_time_us: numerico(
      "Time (dwell) em microssegundos (µs). No pulso HP o time não se ajusta: use 0 em valor, faixa_min e faixa_max.",
    ),
    spacing_um: numerico("Spacing / DOT pitch em micrômetros (µm)."),
    smartstack: numerico("Nível do SmartStack, inteiro de 1 a 5."),
    modo_varredura: {
      type: "object",
      properties: {
        valor: { type: "string", enum: [...MODOS_VARREDURA] },
        motivo: { type: "string" },
      },
      required: ["valor", "motivo"],
      additionalProperties: false,
    },
    forma_area: {
      type: "object",
      properties: {
        valor: {
          type: "string",
          description: "Forma e tamanho da área de scan, ex.: 'hexágono grande'.",
        },
        motivo: { type: "string" },
      },
      required: ["valor", "motivo"],
      additionalProperties: false,
    },
    passadas: {
      type: "object",
      properties: {
        valor: { type: "integer", description: "Número de passadas na sessão." },
        motivo: { type: "string" },
      },
      required: ["valor", "motivo"],
      additionalProperties: false,
    },
  },
  required: [
    "modo_emissao",
    "potencia_w",
    "dwell_time_us",
    "spacing_um",
    "smartstack",
    "modo_varredura",
    "forma_area",
    "passadas",
  ],
  additionalProperties: false,
} as const;

export const RECOMENDACAO_JSON_SCHEMA = {
  type: "object",
  properties: {
    viabilidade: {
      type: "string",
      enum: [...VIABILIDADES],
      description:
        "nao_recomendado quando o CO2 fracionado não é o tratamento certo para este caso ou o risco supera o benefício.",
    },
    resumo: {
      type: "string",
      description:
        "A recomendação em 2 a 3 frases: o que fazer e a lógica principal.",
    },
    alertas: {
      type: "array",
      items: { type: "string" },
      description:
        "Riscos específicos deste caso que o médico precisa ver antes de disparar. Vazio se não houver.",
    },
    parametros: {
      anyOf: [PARAMETROS_JSON_SCHEMA, { type: "null" }],
      description: "null quando a viabilidade for nao_recomendado.",
    },
    protocolo: {
      type: "object",
      properties: {
        sessoes: { type: "string", description: "Quantas sessões, ex.: '3 sessões'." },
        intervalo: { type: "string", description: "Intervalo entre sessões." },
        teste_previo: {
          type: "string",
          description: "Se precisa de teste em área pequena e como fazer.",
        },
        como_progredir: {
          type: "string",
          description: "O que ajustar na sessão seguinte, conforme a resposta.",
        },
      },
      required: ["sessoes", "intervalo", "teste_previo", "como_progredir"],
      additionalProperties: false,
    },
    cuidados_pre: { type: "array", items: { type: "string" } },
    cuidados_pos: { type: "array", items: { type: "string" } },
    alternativas: {
      type: "array",
      items: { type: "string" },
      description:
        "Outros tratamentos ou combinações que valem para o caso (ex.: subcisão, TCA CROSS). Vazio se não houver.",
    },
    // Sem enum de propósito: com os 57 ids da base como valores permitidos, a
    // gramática compilada passou do tamanho que a API aceita ("The compiled
    // grammar is too large", 400 em toda consulta). Id inexistente é
    // descartado no código (recomendar.ts), então a trava aqui era redundante.
    fontes: {
      type: "array",
      items: { type: "string" },
      description:
        'Ids dos trechos da base de conhecimento que sustentam a recomendação, exatamente como no atributo id de cada <trecho> (ex.: "premium-manchas").',
    },
    confianca: { type: "string", enum: [...CONFIANCAS] },
    motivo_confianca: {
      type: "string",
      description:
        "Por que essa confiança: há estudo com o aparelho para este caso, ou é extrapolação?",
    },
    analise_foto: {
      anyOf: [
        {
          type: "object",
          properties: {
            achados: {
              type: "array",
              items: { type: "string" },
              description: "O que se vê nas fotos, por área. Só o visível; sem diagnóstico.",
            },
            divergencias: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  texto: {
                    type: "string",
                    description:
                      "O que a foto mostra que o formulário não diz, e o que você fez com isso.",
                  },
                  achado: {
                    type: "string",
                    enum: [...ACHADOS_FOTO],
                    description:
                      "O item do formulário a que isso corresponde; 'outro' se não houver item.",
                  },
                  grau_sugerido: {
                    type: ["string", "null"],
                    description:
                      "Só quando achado = 'grau': o valor da escala da indicação que a foto sugere (ex.: '3', 'III'). Senão null.",
                  },
                  ajuste_aplicado: {
                    type: "boolean",
                    description:
                      "true se você já deixou os parâmetros mais conservadores por causa deste achado.",
                  },
                },
                required: ["texto", "achado", "grau_sugerido", "ajuste_aplicado"],
                additionalProperties: false,
              },
              description:
                "Onde a foto contradiz ou acrescenta ao formulário (grau, acne ativa, rosácea, área).",
            },
            limitacoes: {
              type: "array",
              items: { type: "string" },
              description: "O que a foto não deixou avaliar (luz, ângulo, foco, maquiagem).",
            },
          },
          required: ["achados", "divergencias", "limitacoes"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
      description: "null quando não houver foto no caso.",
    },
    parametros_focada: {
      anyOf: [
        {
          type: "object",
          properties: {
            modo: { type: "string", enum: [...MODOS_FOCADA] },
            potencia_w: { type: "number", description: "Potência em watts." },
            // Sem união: 0 no CW, convertido para null no zod abaixo.
            frequencia_hz: {
              type: "number",
              description: "Frequência em Hz; 0 no CW (contínuo).",
            },
            motivo: { type: "string" },
          },
          required: ["modo", "potencia_w", "frequencia_hz", "motivo"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
      description:
        "Só quando a indicação é lesão isolada com peça focada (sem scanner); nesse caso 'parametros' é null. Senão null.",
    },
    perguntas_pendentes: {
      type: "array",
      items: { type: "string" },
      description:
        "Perguntas ao médico cuja resposta mudaria a recomendação, cada uma dizendo o que mudaria. Vazio se nada faltou.",
    },
  },
  required: [
    "viabilidade",
    "resumo",
    "alertas",
    "parametros",
    "protocolo",
    "cuidados_pre",
    "cuidados_pos",
    "alternativas",
    "fontes",
    "confianca",
    "motivo_confianca",
    "perguntas_pendentes",
    "analise_foto",
    "parametros_focada",
  ],
  additionalProperties: false,
} as const;

const numericoZ = z.object({
  valor: z.number(),
  faixa_min: z.number(),
  faixa_max: z.number(),
  motivo: z.string(),
});

export const recomendacaoSchema = z.object({
  viabilidade: z.enum(VIABILIDADES),
  resumo: z.string(),
  alertas: z.array(z.string()),
  parametros: z
    .object({
      modo_emissao: z.object({ valor: z.enum(MODOS_EMISSAO), motivo: z.string() }),
      potencia_w: numericoZ,
      // 0 = "não se aplica" (HP). Consultas gravadas antes já trazem null.
      dwell_time_us: z.preprocess(
        (d) =>
          d && typeof d === "object" && (d as { valor?: unknown }).valor === 0 ? null : d,
        numericoZ.nullable(),
      ),
      spacing_um: numericoZ,
      smartstack: numericoZ,
      modo_varredura: z.object({
        valor: z.enum(MODOS_VARREDURA),
        motivo: z.string(),
      }),
      forma_area: z.object({ valor: z.string(), motivo: z.string() }),
      passadas: z.object({ valor: z.number().int(), motivo: z.string() }),
    })
    .nullable(),
  protocolo: z.object({
    sessoes: z.string(),
    intervalo: z.string(),
    teste_previo: z.string(),
    como_progredir: z.string(),
  }),
  cuidados_pre: z.array(z.string()),
  cuidados_pos: z.array(z.string()),
  alternativas: z.array(z.string()),
  // Um id que não existe mais na base é descartado em vez de derrubar a
  // consulta: a recomendação continua valendo, só perde aquela citação.
  fontes: z.array(z.string()),
  confianca: z.enum(CONFIANCAS),
  motivo_confianca: z.string(),
  // Ausente nas consultas gravadas antes de o campo existir.
  perguntas_pendentes: z.array(z.string()).default([]),
  // Ausente nas consultas gravadas antes de o campo existir.
  analise_foto: z
    .object({
      achados: z.array(z.string()),
      // Consultas gravadas antes traziam só o texto; viram "outro".
      divergencias: z.array(
        z.preprocess(
          (d) =>
            typeof d === "string"
              ? { texto: d, achado: "outro", grau_sugerido: null, ajuste_aplicado: false }
              : d,
          z.object({
            texto: z.string(),
            achado: z.enum(ACHADOS_FOTO).catch("outro"),
            grau_sugerido: z.string().nullable().default(null),
            ajuste_aplicado: z.boolean().default(false),
          }),
        ),
      ),
      limitacoes: z.array(z.string()),
    })
    .nullable()
    .default(null),
  // Ausente nas consultas gravadas antes de o campo existir.
  parametros_focada: z
    .object({
      modo: z.enum(MODOS_FOCADA),
      potencia_w: z.number(),
      // 0 = contínuo (CW).
      frequencia_hz: z.preprocess((v) => (v === 0 ? null : v), z.number().nullable()),
      motivo: z.string(),
    })
    .nullable()
    .default(null),
});

// ============================================================================
//  Entrada do formulário
// ============================================================================
const numeroOpcional = (min: number, max: number) =>
  z.number().min(min).max(max).nullable().default(null);

export const sessaoAnteriorSchema = z.object({
  potencia: numeroOpcional(1, 50),
  dwell: numeroOpcional(100, 3000),
  spacing: numeroOpcional(100, 1500),
  stack: numeroOpcional(1, 5),
  diasEritema: numeroOpcional(0, 90),
  teveHpi: z.boolean().default(false),
  resultado: z.enum(RESULTADOS_ANTERIORES).nullable().default(null),
});

/**
 * Os `.default()` deixam passar consultas gravadas antes de os campos novos
 * existirem: o histórico da tela continua abrindo.
 */
const entradaObjeto = z.object({
  indicacao: z.enum(INDICACOES, { message: "Escolha a indicação." }),
  melasmaTipo: z.enum(TIPOS_MELASMA).nullable().default(null),
  melasmaRefratario: z.boolean().nullable().default(null),
  idadeCicatriz: z.enum(IDADES_CICATRIZ).nullable().default(null),
  lesaoFocal: z.enum(LESOES_FOCAIS_IDS).nullable().default(null),
  regiao: z.enum(REGIOES, { message: "Escolha a região." }),
  extensao: z.enum(EXTENSOES).default("regiao_inteira"),
  grau: z.string().max(40).nullable().default(null),
  fototipo: z.enum(FOTOTIPOS, { message: "Escolha o fototipo." }),
  idade: z.number().int().min(12).max(100).nullable().default(null),
  caracteristicasPele: z
    .array(z.enum(CARACTERISTICAS_PELE))
    .max(CARACTERISTICAS_PELE.length)
    .default([]),
  historico: z.array(z.enum(HISTORICOS)).max(HISTORICOS.length),
  sessao: z.enum(SESSOES),
  sessaoAnterior: sessaoAnteriorSchema.nullable().default(null),
  respostaAnterior: z
    .string()
    .trim()
    .max(1000, "A resposta anterior passa de 1000 caracteres.")
    .default(""),
  associacoes: z.array(z.enum(ASSOCIACOES)).max(ASSOCIACOES.length).default([]),
  downtime: z.enum(DOWNTIMES),
  exposicaoSolar: z.enum(EXPOSICOES_SOLARES).default("baixa"),
  observacoes: z
    .string()
    .trim()
    .max(2000, "As observações passam de 2000 caracteres.")
    .default(""),
  achadosConfirmados: z.array(z.string().trim().max(500)).max(20).default([]),
  achadosDescartados: z.array(z.string().trim().max(500)).max(20).default([]),
});

/**
 * Converte consultas gravadas antes das escalas de grau.
 *
 * Antes havia três indicações de rejuvenescimento e um campo "gravidade"
 * genérico. As três viram "rejuvenescimento" com o Glogau equivalente, e a
 * gravidade antiga é descartada: ela não tem correspondência com as escalas.
 */
const REJUVENESCIMENTO_ANTIGO: Record<string, string> = {
  rejuvenescimento_leve: "I",
  rejuvenescimento_moderado: "III",
  rejuvenescimento_intenso: "IV",
};

function migrarEntradaAntiga(bruto: unknown): unknown {
  if (!bruto || typeof bruto !== "object") return bruto;
  const { gravidade: _descartada, ...resto } = bruto as Record<string, unknown>;
  const glogau =
    typeof resto.indicacao === "string"
      ? REJUVENESCIMENTO_ANTIGO[resto.indicacao]
      : undefined;
  if (glogau) {
    return { ...resto, indicacao: "rejuvenescimento", grau: resto.grau ?? glogau };
  }
  return resto;
}

export const entradaSchema = z.preprocess(migrarEntradaAntiga, entradaObjeto);

// ============================================================================
//  Parâmetros realizados
// ============================================================================
export const realizadoSchema = z.object({
  modo: z.enum(MODOS_EMISSAO).nullable().default(null),
  potencia: z.number().min(0).max(50).nullable().default(null),
  dwell: z.number().min(0).max(3000).nullable().default(null),
  spacing: z.number().min(0).max(1500).nullable().default(null),
  stack: z.number().int().min(1).max(5).nullable().default(null),
  varredura: z.enum(MODOS_VARREDURA).nullable().default(null),
  passadas: z.number().int().min(1).max(5).nullable().default(null),
  notas: z.string().trim().max(1000, "As notas passam de 1000 caracteres.").default(""),
  registradoEm: z.string().nullable().default(null),
});
