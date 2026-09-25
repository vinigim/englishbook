import type {
  FunnelStage,
  LeadStatus,
  Objection,
  RecommendedAction,
  Temperature,
  EffectiveTemperature,
} from "@/lib/leads/taxonomy";

export type LeadKind = "medico" | "clinica" | "desconhecido" | "outro";
export type LeadSource = "whatsapp" | "planilha" | "manual" | "ambos";
export type MessageDirection = "in" | "out";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "other";

export type Lead = {
  id: string;
  phone_key: string;
  phone_e164: string;
  wa_jid: string | null;
  display_name: string | null;
  sheet_name: string | null;
  clinic_name: string | null;
  specialty: string | null;
  city: string | null;
  uf: string | null;
  /** Só o handle, sem @ e sem link — vem da planilha (0015). */
  instagram: string | null;
  /** O dono escolheu o @ na ficha; a planilha não o troca. Nulo = veio da planilha. */
  instagram_escolhido_em?: string | null;
  /**
   * Quando o dono marcou que mandou mensagem pelo direct (0016).
   *
   * Manual porque envio pelo Instagram não volta em sincronização nenhuma —
   * ao contrário do WhatsApp, que atualiza `last_outbound_at` sozinho.
   */
  instagram_sent_at: string | null;
  /**
   * O WhatsApp respondeu que este telefone tem conta? (0020)
   * Nulo = não verificado. Opcional para não quebrar antes da migração rodar.
   */
  whatsapp_existe?: boolean | null;
  whatsapp_verificado_em?: string | null;
  lead_kind: LeadKind;
  source: LeadSource;
  /** Marcado pelo dono. Prevalece sobre a derivação da agenda. Nulo = derivar. */
  status: LeadStatus | null;
  is_group: boolean;
  notes: string | null;
  extra: Record<string, unknown>;
  first_seen_at: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  /** Marcado pelo dono. Prevalece sobre a leitura da IA. Nulo = seguir a IA. */
  temperature_manual: EffectiveTemperature | null;
  needs_analysis: boolean;
  snoozed_until: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type WaMessage = {
  id: string;
  lead_id: string;
  provider: string;
  provider_message_id: string;
  chat_id: string | null;
  direction: MessageDirection;
  message_type: MessageType;
  body: string | null;
  caption: string | null;
  media_url: string | null;
  media_mime: string | null;
  sent_at: string;
};

export type LeadAnalysis = {
  id: string;
  lead_id: string;
  version: number;
  content_hash: string;
  prompt_version: number;
  stage: FunnelStage;
  temperature: Temperature;
  intent: string | null;
  summary: string | null;
  objections: Objection[];
  equipment_interest: string[];
  equip_id: string | null;
  specialty: string | null;
  days_since_last_contact: number | null;
  is_existing_customer: boolean | null;
  recommended_action: RecommendedAction | null;
  draft_message: string | null;
  rationale: string | null;
  confidence: number | null;
  priority_score: number | null;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
};

/** Uma linha da caixa de entrada: o lead + a análise mais recente dele. */
/** Agregado de locações por lead, vindo da view wa_lead_rentals (0014). */
export type LeadRentals = {
  lead_id: string;
  total: number;
  ultima: string | null;
  primeira: string | null;
  total_brl: number | null;
};

export type LeadInboxRow = {
  lead: Lead;
  analysis: LeadAnalysis | null;
  lastMessage: Pick<WaMessage, "body" | "direction" | "message_type" | "sent_at"> | null;
  /** Agregado da agenda. Nulo quando o lead nunca alugou. */
  rentals: LeadRentals | null;
  priority: number;
};

/** Uma locação já registrada na agenda, ligada a este lead. */
export type LeadRental = {
  id: string;
  date: string;
  equipmentName: string | null;
  price: number | null;
  specialty: string | null;
  notes: string | null;
};

export type LeadDetail = {
  lead: Lead;
  messages: WaMessage[];
  analysis: LeadAnalysis | null;
  rentals: LeadRental[];
};
