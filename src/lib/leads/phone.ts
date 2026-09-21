import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Normaliza um telefone para o formato E.164 sem o "+", ex: "5511999998888".
 *
 * Como a maioria das planilhas brasileiras vem sem o código do país e com
 * formatações variadas — "(11) 99999-8888", "11999998888", "+55 11 9999-8888" —
 * assumimos BR como país padrão, mas respeitamos o "+" quando presente.
 *
 * Retorna `null` quando o número não é válido/discável.
 *
 * (Copiado de whatsapp-prospector/src/lib/phone.ts — aquele app está no
 * "exclude" do tsconfig da raiz, então não dá para importar de lá.)
 */
export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = "BR",
): string | null {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+");
  const parsed = parsePhoneNumberFromString(
    trimmed,
    hasPlus ? undefined : defaultCountry,
  );

  if (!parsed || !parsed.isValid()) return null;

  return parsed.number.replace(/^\+/, "");
}

/** Versão amigável para exibição, ex: "+55 11 99999-8888". */
export function formatPhoneForDisplay(
  raw: string,
  defaultCountry: CountryCode = "BR",
): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const parsed = parsePhoneNumberFromString(
    trimmed,
    hasPlus ? undefined : defaultCountry,
  );
  if (!parsed || !parsed.isValid()) return null;
  return parsed.formatInternational();
}

/**
 * Chave canônica de deduplicação de lead.
 *
 * O WhatsApp devolve o JID de números brasileiros antigos SEM o 9º dígito
 * ("553588887777"), enquanto a planilha do cliente quase sempre traz ele
 * ("5535988887777"). Se a chave fosse o E.164 puro, o mesmo médico viraria
 * dois leads — e o painel mostraria a conversa dividida ao meio.
 *
 * Regra: em celular brasileiro (55 + DDD de 2 dígitos + 9 dígitos = 13), o
 * dígito extra é sempre o "9" logo após o DDD. Removemos ele para formar a
 * chave. Números de outros países e fixos passam intactos.
 *
 *   waPhoneKey("5535988887777") === "553588887777"
 *   waPhoneKey("553588887777")  === "553588887777"
 */
export function waPhoneKey(phoneE164: string): string {
  const digits = String(phoneE164 ?? "").replace(/\D/g, "");

  if (digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
    return digits.slice(0, 4) + digits.slice(5);
  }

  return digits;
}

/**
 * Converte qualquer telefone cru direto para a dupla usada no banco.
 * Retorna `null` se o número não for discável.
 */
export function toLeadPhone(
  raw: string,
): { phoneE164: string; phoneKey: string } | null {
  const phoneE164 = normalizePhone(raw);
  if (!phoneE164) return null;
  return { phoneE164, phoneKey: waPhoneKey(phoneE164) };
}
