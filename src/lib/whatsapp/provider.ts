/**
 * Contrato único de provedor de WhatsApp.
 *
 * Existe para que a escolha do provedor seja uma troca de arquivo, não uma
 * reescrita: hoje é a Evolution API (não-oficial, QR Code), amanhã pode ser
 * Z-API, UazAPI ou a Cloud API oficial da Meta. Tudo que o resto do sistema
 * enxerga é `NormalizedMessage`.
 */

export type WaDirection = "in" | "out";

export type WaMessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "other";

/**
 * A forma comum que vai para o banco, venha de qual provedor vier.
 *
 * `phoneE164` é SEMPRE o interlocutor — nunca o número da empresa. Numa
 * mensagem que nós enviamos, é o destinatário; numa recebida, o remetente.
 * É isso que permite agrupar os dois lados na mesma conversa.
 */
export type NormalizedMessage = {
  providerMessageId: string;
  chatId: string;
  phoneE164: string;
  direction: WaDirection;
  type: WaMessageType;
  body: string | null;
  caption: string | null;
  /** Referência da mídia. Nunca baixamos o binário — ver nota de LGPD no README. */
  mediaUrl: string | null;
  mediaMime: string | null;
  pushName: string | null;
  isGroup: boolean;
  sentAt: string; // ISO
  raw: unknown;
};

export type WaChat = {
  chatId: string;
  phoneE164: string;
  name: string | null;
  isGroup: boolean;
  lastMessageAt: string | null;
};

export type WaConnection = {
  connected: boolean;
  label: string;
};

export type WebhookRequest = {
  url: URL;
  headers: Headers;
  rawBody: string;
};

export interface WhatsAppProvider {
  readonly id: string;

  /**
   * Autentica o request do webhook. Provedores não-oficiais não assinam o
   * payload com HMAC, então isso é um segredo compartilhado — comparado em
   * tempo constante, porque a URL é pública e dá acesso de escrita.
   */
  verifyWebhook(req: WebhookRequest): boolean;

  /**
   * Id estável do evento, usado como PK em wa_webhook_events para garantir
   * idempotência. `null` significa "evento que não nos interessa, ignore".
   */
  eventId(payload: unknown): string | null;

  /** Um payload pode trazer de 0 a N mensagens. */
  normalizeInbound(payload: unknown): NormalizedMessage[];

  listChats(opts?: { limit?: number }): Promise<WaChat[]>;

  fetchChatHistory(
    chatId: string,
    opts?: { limit?: number; before?: string },
  ): Promise<NormalizedMessage[]>;

  /**
   * Implementado, mas NÃO ligado a nenhum botão na v1.
   *
   * Envio em volume por provedor não-oficial é exatamente o que dispara
   * banimento de número. Na v1 o dono envia pelo link wa.me, ou seja, pelo
   * WhatsApp real dele, sem risco adicional. Isto fica pronto para a v2.
   */
  sendText(
    phoneE164: string,
    text: string,
  ): Promise<{ providerMessageId: string }>;

  connectionStatus(): Promise<WaConnection>;
}

// ============================================================================
//  Utilidades compartilhadas entre adaptadores
// ============================================================================

/** "5535988887777@s.whatsapp.net" -> "5535988887777" */
export function jidToPhone(jid: string): string {
  return String(jid ?? "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

export function isGroupJid(jid: string): boolean {
  return String(jid ?? "").includes("@g.us");
}

/** Aceita epoch em segundos ou milissegundos, ou uma data ISO. */
export function toIsoDate(value: unknown): string {
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) return toIsoDate(asNumber);
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}
