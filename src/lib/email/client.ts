import { Resend } from "resend";

// Client lazy — só instancia quando precisar (evita erro em build se a env
// ainda não estiver configurada)
let _resend: Resend | null = null;

export function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY não configurado");
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

export const EMAIL_FROM = process.env.EMAIL_FROM || "EnglishBook <no-reply@englishbook.app>";
