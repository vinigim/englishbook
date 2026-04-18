import { emailLayout, EMAIL_COLOR, escapeHtml } from "../layout";

type Props = {
  studentName: string;
  teacherName: string;
  scheduledStartAt: string;
  reason: "payment_timeout" | "payment_failed" | "checkout_expired";
};

const REASON_COPY: Record<Props["reason"], { short: string; full: string }> = {
  payment_timeout: {
    short: "o pagamento não foi finalizado a tempo",
    full: "Você começou o agendamento mas o pagamento não foi concluído dentro do prazo de 15 minutos.",
  },
  payment_failed: {
    short: "o pagamento foi recusado",
    full: "A operadora do cartão recusou a cobrança. Pode ser saldo, limite ou um bloqueio preventivo — vale tentar de novo ou usar outro cartão.",
  },
  checkout_expired: {
    short: "a tela de pagamento expirou",
    full: "A sessão de pagamento expirou antes de ser finalizada.",
  },
};

export function bookingCancelledEmail(props: Props): {
  subject: string;
  html: string;
  text: string;
} {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://englishbook.app";
  const firstName = props.studentName.split(" ")[0];
  const copy = REASON_COPY[props.reason];

  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(props.scheduledStartAt));

  const formattedTime = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(props.scheduledStartAt));

  const subject = `Seu agendamento com ${props.teacherName} foi cancelado`;

  const html = emailLayout({
    preview: `Cancelamento: ${copy.short}`,
    title: subject,
    children: `
<p style="margin:0 0 8px 0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${EMAIL_COLOR.accent};">
  Agendamento cancelado
</p>
<h1 style="margin:0 0 24px 0;font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-0.5px;color:${EMAIL_COLOR.ink};font-weight:normal;">
  ${escapeHtml(firstName)}, ${copy.short}.
</h1>

<p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:${EMAIL_COLOR.muted};">
  ${copy.full}
</p>

<div style="border-left:3px solid ${EMAIL_COLOR.accent};padding:4px 0 4px 16px;margin:0 0 32px 0;">
  <p style="margin:0;font-size:14px;color:${EMAIL_COLOR.muted};">Aula que seria com:</p>
  <p style="margin:4px 0 0 0;font-size:16px;color:${EMAIL_COLOR.ink};">
    <strong>${escapeHtml(props.teacherName)}</strong> · ${escapeHtml(formattedDate)} às ${escapeHtml(formattedTime)}
  </p>
</div>

<p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:${EMAIL_COLOR.ink};">
  Nenhuma cobrança efetiva foi feita no seu cartão${props.reason === "payment_failed" ? " — se aparecer algum débito temporário, ele será estornado pela operadora em poucos dias" : ""}.
</p>

<!-- CTA -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="background:${EMAIL_COLOR.ink};">
<a href="${appUrl}/aluno/agendar" style="display:inline-block;padding:14px 28px;color:${EMAIL_COLOR.paper};text-decoration:none;font-size:15px;font-weight:500;">
  Tentar novamente
</a>
</td>
</tr>
</table>
`,
  });

  const text = `Agendamento cancelado

${copy.full}

Aula que seria: ${props.teacherName} - ${formattedDate} às ${formattedTime}

Nenhuma cobrança efetiva foi feita.

Tentar novamente: ${appUrl}/aluno/agendar
`;

  return { subject, html, text };
}
