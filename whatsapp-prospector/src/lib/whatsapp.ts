// Cliente mínimo da WhatsApp Cloud API (Meta Graph API).
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

import type { MetaTemplate } from "./types";

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  apiVersion: string;
}

export function getConfig(): WhatsAppConfig {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "";
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
  return { accessToken, phoneNumberId, businessAccountId, apiVersion };
}

export function isConfigured(cfg: WhatsAppConfig): boolean {
  return Boolean(cfg.accessToken && cfg.phoneNumberId);
}

export interface SendTemplateParams {
  to: string; // E.164 sem "+", ex: 5511999998888
  templateName: string;
  languageCode: string; // ex: pt_BR
  /** Variáveis do corpo, na ordem {{1}}, {{2}}, ... */
  bodyVariables: string[];
}

export interface SendTemplateResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** Envia UMA mensagem de template para um número. */
export async function sendTemplateMessage(
  cfg: WhatsAppConfig,
  params: SendTemplateParams,
): Promise<SendTemplateResult> {
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;

  const components =
    params.bodyVariables.length > 0
      ? [
          {
            type: "body",
            parameters: params.bodyVariables.map((text) => ({
              type: "text",
              text,
            })),
          },
        ]
      : [];

  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.error?.error_data?.details ||
        `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    const messageId = data?.messages?.[0]?.id as string | undefined;
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Converte a resposta bruta do endpoint message_templates da Graph API na
 * nossa forma enxuta. Extraído como função pura para ser testável sem rede.
 */
export function parseTemplatesResponse(data: any): MetaTemplate[] {
  return (data?.data ?? []).map((t: any): MetaTemplate => {
    const bodyComponent = (t.components ?? []).find(
      (c: any) => c.type === "BODY",
    );
    const bodyText: string | null = bodyComponent?.text ?? null;
    const variableCount = bodyText
      ? new Set([...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]))
          .size
      : 0;
    return {
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      bodyText,
      variableCount,
    };
  });
}

/**
 * Lista os templates da WABA (Business Account). Serve para o usuário escolher
 * um template já aprovado, em vez de digitar o nome na mão.
 */
export async function listTemplates(
  cfg: WhatsAppConfig,
): Promise<{ ok: boolean; templates?: MetaTemplate[]; error?: string }> {
  if (!cfg.businessAccountId) {
    return { ok: false, error: "WHATSAPP_BUSINESS_ACCOUNT_ID não configurado." };
  }

  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.businessAccountId}/message_templates?limit=100`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    }

    return { ok: true, templates: parseTemplatesResponse(data) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
