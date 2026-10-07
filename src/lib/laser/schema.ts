import { z } from "zod";
import { IDS_BASE } from "./base-conhecimento";
import {
  CONFIANCAS,
  DOWNTIMES,
  FOTOTIPOS,
  GRAVIDADES,
  HISTORICOS,
  INDICACOES,
  MODOS_EMISSAO,
  MODOS_VARREDURA,
  REGIOES,
  SESSOES,
  VIABILIDADES,
} from "./tipos";

/**
 * Formato da recomendação.
 *
 * Mesmo arranjo de src/lib/ai/schema.ts: o JSON schema vai para
 * `output_config.format`, e o zod ao lado confere o que voltou antes de
 * gravar. Limites numéricos (potência máxima etc.) NÃO vão no JSON schema —
 * structured outputs não os garante —, e sim em ./guardas.ts, no código.
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
    dwell_time_us: numerico("Dwell time em microssegundos (µs)."),
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
    fontes: {
      type: "array",
      items: { type: "string", enum: [...IDS_BASE] },
      description: "Ids dos trechos da base de conhecimento que sustentam a recomendação.",
    },
    confianca: { type: "string", enum: [...CONFIANCAS] },
    motivo_confianca: {
      type: "string",
      description:
        "Por que essa confiança: há estudo com o aparelho para este caso, ou é extrapolação?",
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
      dwell_time_us: numericoZ,
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
});

// ============================================================================
//  Entrada do formulário
// ============================================================================
export const entradaSchema = z.object({
  indicacao: z.enum(INDICACOES, { message: "Escolha a indicação." }),
  regiao: z.enum(REGIOES, { message: "Escolha a região." }),
  fototipo: z.enum(FOTOTIPOS, { message: "Escolha o fototipo." }),
  gravidade: z.enum(GRAVIDADES),
  downtime: z.enum(DOWNTIMES),
  sessao: z.enum(SESSOES),
  respostaAnterior: z
    .string()
    .trim()
    .max(1000, "A resposta anterior passa de 1000 caracteres."),
  idade: z.number().int().min(12).max(100).nullable(),
  historico: z.array(z.enum(HISTORICOS)).max(HISTORICOS.length),
  observacoes: z
    .string()
    .trim()
    .max(2000, "As observações passam de 2000 caracteres."),
});
