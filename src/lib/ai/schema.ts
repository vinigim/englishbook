import { z } from "zod";
import {
  FUNNEL_STAGES,
  OBJECTIONS,
  RECOMMENDED_ACTIONS,
  TEMPERATURES,
} from "@/lib/leads/taxonomy";

/**
 * Formato da saída da IA.
 *
 * Os schemas JSON abaixo vão para `output_config.format` via
 * `jsonSchemaOutputFormat`, que é o caminho sem zod v4 — o repo inteiro está
 * no zod 3, e um upgrade major só para isso não se justifica.
 *
 * Os schemas zod ao lado são a segunda linha de defesa: validam o que voltou
 * antes de gravar. `parsed_output` pode vir nulo, e a API pode mudar.
 */

// ============================================================================
//  Triagem — roda em TODOS os leads, com o modelo barato
// ============================================================================
export const TRIAGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    stage: {
      type: "string",
      enum: FUNNEL_STAGES as unknown as string[],
      description: "Em que ponto do funil este lead está.",
    },
    temperature: {
      type: "string",
      enum: TEMPERATURES as unknown as string[],
      description:
        "Quente = pronto para fechar ou esperando resposta nossa agora. Morno = interessado mas sem urgência. Frio = sem sinal de intenção.",
    },
    intent: {
      type: "string",
      description: "Em uma frase, o que este lead quer agora.",
    },
    summary: {
      type: "string",
      description: "Resumo da conversa em 2 a 3 frases, em português.",
    },
    objections: {
      type: "array",
      items: { type: "string", enum: OBJECTIONS as unknown as string[] },
      description: "Objeções que aparecem na conversa.",
    },
    equipment_interest: {
      type: "array",
      items: { type: "string" },
      description:
        "Nomes de equipamentos do catálogo que interessam a este lead. Use os nomes exatos do catálogo.",
    },
    specialty: {
      type: ["string", "null"],
      description: "Especialidade médica, se der para inferir.",
    },
    is_existing_customer: {
      type: "boolean",
      description: "Já alugou da Lux Derma alguma vez?",
    },
    confidence: {
      type: "number",
      description: "De 0 a 1, o quanto você confia nesta leitura.",
    },
  },
  required: [
    "stage",
    "temperature",
    "intent",
    "summary",
    "objections",
    "equipment_interest",
    "specialty",
    "is_existing_customer",
    "confidence",
  ],
  additionalProperties: false,
} as const;

export const triageSchema = z.object({
  stage: z.enum(FUNNEL_STAGES),
  temperature: z.enum(TEMPERATURES),
  intent: z.string(),
  summary: z.string(),
  objections: z.array(z.enum(OBJECTIONS)),
  equipment_interest: z.array(z.string()),
  specialty: z.string().nullable(),
  is_existing_customer: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type TriageOutput = z.infer<typeof triageSchema>;

// ============================================================================
//  Redação — só nos leads que valem, com o modelo forte
// ============================================================================
export const DRAFT_JSON_SCHEMA = {
  type: "object",
  properties: {
    recommended_action: {
      type: "string",
      enum: RECOMMENDED_ACTIONS as unknown as string[],
      description: "Que tipo de mensagem cabe agora.",
    },
    draft_message: {
      type: ["string", "null"],
      description:
        "A mensagem pronta para enviar, em português, no tom de WhatsApp. Deve ser null quando a ação for 'aguardar' ou 'descartar'.",
    },
    rationale: {
      type: "string",
      description:
        "Por que esta ação e não outra, em 1 ou 2 frases. É o que o dono lê para decidir se concorda.",
    },
    confidence: {
      type: "number",
      description: "De 0 a 1, o quanto você confia nesta recomendação.",
    },
  },
  required: ["recommended_action", "draft_message", "rationale", "confidence"],
  additionalProperties: false,
} as const;

export const draftSchema = z.object({
  recommended_action: z.enum(RECOMMENDED_ACTIONS),
  draft_message: z.string().nullable(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
});

export type DraftOutput = z.infer<typeof draftSchema>;
