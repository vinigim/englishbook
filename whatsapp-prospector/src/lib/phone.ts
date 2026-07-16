import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

/**
 * Normaliza um telefone para o formato E.164 sem o "+" (o que a Cloud API
 * espera no campo `to`), ex: "5511999998888".
 *
 * Como a maioria das planilhas brasileiras vem sem o código do país e com
 * formatações variadas — "(11) 99999-8888", "11999998888", "+55 11 9999-8888" —
 * assumimos BR como país padrão, mas respeitamos o "+" quando presente.
 *
 * Retorna `null` quando o número não é válido/discável.
 */
export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = "BR",
): string | null {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Se já vier com "+", o país é explícito; senão usamos o default.
  const hasPlus = trimmed.startsWith("+");
  const parsed = parsePhoneNumberFromString(
    trimmed,
    hasPlus ? undefined : defaultCountry,
  );

  if (!parsed || !parsed.isValid()) return null;

  // E.164 é "+5511...", removemos o "+" para o payload da Cloud API.
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
