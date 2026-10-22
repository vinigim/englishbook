import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { htmlParaTexto } from "../filtro";
import type { Fonte } from "../tipos";

// ---------------------------------------------------------------------
// Lê os e-mails de alerta de vagas do Gmail por IMAP, com senha de app.
// LinkedIn, Indeed, Glassdoor e Catho não têm API de busca pública, mas
// mandam alertas por e-mail — que você mesmo configura em cada site.
// A extração das vagas de dentro do e-mail é feita por IA (ai/extracao-email.ts).
// ---------------------------------------------------------------------

// `de` é um endereço exato ou um domínio inteiro. Do LinkedIn só os remetentes
// de vagas: a mesma caixa costuma receber milhares de notificações, convites e
// mensagens dele, e cada e-mail lido passa pela IA.
const REMETENTES: { de: string; fonte: Fonte }[] = [
  { de: "jobalerts-noreply@linkedin.com", fonte: "linkedin" },
  { de: "jobs-listings@linkedin.com", fonte: "linkedin" },
  { de: "indeed.com", fonte: "indeed" },
  { de: "glassdoor.com", fonte: "glassdoor" },
  { de: "catho.com.br", fonte: "catho" },
];

function remetenteBate(endereco: string, de: string): boolean {
  return de.includes("@") ? endereco === de : endereco === de || endereco.endsWith(`@${de}`) || endereco.endsWith(`.${de}`);
}

export interface EmailAlerta {
  messageId: string;
  remetente: string;
  assunto: string;
  data: string | null;
  fonte: Fonte;
  /** Corpo em texto com os links preservados como `texto [url]`. */
  texto: string;
}

export function gmailConfigurado(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** E-mails de alerta dos últimos `dias` dias que ainda não estão em `jaProcessados`. */
export async function lerAlertas(dias: number, jaProcessados: Set<string>): Promise<EmailAlerta[]> {
  const cliente = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! },
    logger: false,
  });
  await cliente.connect();
  try {
    // "Todos os e-mails" pega os alertas mesmo se um filtro os tirou da caixa de entrada.
    const pastas = await cliente.list();
    const todos = pastas.find((p) => p.specialUse === "\\All")?.path ?? "INBOX";
    const trava = await cliente.getMailboxLock(todos);
    try {
      const de = REMETENTES.map((r) => r.de).join(" OR ");
      const uids = await cliente.search({ gmraw: `from:(${de}) newer_than:${dias}d` }, { uid: true });
      if (!uids || uids.length === 0) return [];

      const emails: EmailAlerta[] = [];
      for await (const msg of cliente.fetch(uids, { source: true, envelope: true }, { uid: true })) {
        const messageId = msg.envelope?.messageId ?? `uid-${msg.uid}`;
        if (jaProcessados.has(messageId) || !msg.source) continue;

        const remetente = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? "";
        const fonte = REMETENTES.find((r) => remetenteBate(remetente, r.de))?.fonte ?? "email";
        const parsed = await simpleParser(msg.source);
        const texto = parsed.html ? htmlParaTexto(parsed.html, true) : (parsed.text ?? "");

        emails.push({
          messageId,
          remetente,
          assunto: parsed.subject ?? "",
          data: parsed.date?.toISOString() ?? null,
          fonte,
          texto,
        });
      }
      return emails;
    } finally {
      trava.release();
    }
  } finally {
    await cliente.logout().catch(() => {});
  }
}

// ---------------------------------------------------------------------
// Os links dos alertas vêm com rastreamento; guardamos a URL canônica da vaga.
// ---------------------------------------------------------------------
export function urlCanonica(url: string): { url: string; idExterno: string | null } {
  const linkedin = url.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i);
  if (linkedin) return { url: `https://www.linkedin.com/jobs/view/${linkedin[1]}`, idExterno: linkedin[1] };

  const indeed = url.match(/indeed\.com\/.*[?&](?:jk|vjk)=([0-9a-f]+)/i);
  if (indeed) return { url: `https://br.indeed.com/viewjob?jk=${indeed[1]}`, idExterno: indeed[1] };

  const glassdoor = url.match(/glassdoor\.com(?:\.br)?\/.*[?&]jobListingId=(\d+)/i);
  if (glassdoor) return { url, idExterno: glassdoor[1] };

  return { url, idExterno: null };
}
