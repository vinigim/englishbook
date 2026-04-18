import { emailLayout, EMAIL_COLOR, escapeHtml } from "../layout";
import { formatBRL } from "@/lib/utils";

type Props = {
  studentName: string;
  teacherName: string;
  scheduledStartAt: string; // ISO
  priceCents: number;
  bookingId: string;
};

export function bookingConfirmedEmail(props: Props): {
  subject: string;
  html: string;
  text: string;
} {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://englishbook.app";
  const firstName = props.studentName.split(" ")[0];
  const shortId = props.bookingId.slice(0, 6).toUpperCase();

  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(props.scheduledStartAt));

  const formattedTime = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(props.scheduledStartAt));

  const subject = `Sua aula com ${props.teacherName} está confirmada`;

  const html = emailLayout({
    preview: `Aula confirmada: ${formattedDate} às ${formattedTime}`,
    title: subject,
    children: `
<p style="margin:0 0 8px 0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${EMAIL_COLOR.muted};">
  Tudo certo
</p>
<h1 style="margin:0 0 24px 0;font-family:Georgia,serif;font-size:36px;line-height:1.1;letter-spacing:-0.5px;color:${EMAIL_COLOR.ink};font-weight:normal;">
  ${escapeHtml(firstName)}, sua aula está <em style="color:${EMAIL_COLOR.accent};">confirmada.</em>
</h1>

<p style="margin:0 0 32px 0;font-size:16px;line-height:1.6;color:${EMAIL_COLOR.muted};">
  Guarde este e-mail — ele é seu comprovante. Recomendamos chegar alguns minutos antes e testar microfone/câmera.
</p>

<!-- Ticket -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${EMAIL_COLOR.ink};color:${EMAIL_COLOR.paper};margin:0 0 32px 0;">
<tr>
<td style="padding:32px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="padding-bottom:24px;">
<p style="margin:0;font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:0.7;">EnglishBook</p>
<p style="margin:4px 0 0 0;font-family:Georgia,serif;font-size:22px;">Lesson Pass</p>
</td>
<td align="right" style="padding-bottom:24px;font-size:11px;letter-spacing:2px;opacity:0.7;vertical-align:top;">
№ ${shortId}
</td>
</tr>
<tr><td colspan="2" style="border-top:1px solid rgba(250,247,242,0.2);padding-top:16px;"></td></tr>
${row("Professor", escapeHtml(props.teacherName))}
${row("Data", escapeHtml(formattedDate))}
${row("Horário", escapeHtml(formattedTime))}
<tr><td colspan="2" style="border-top:1px solid rgba(250,247,242,0.2);padding-top:12px;"></td></tr>
${row("Total pago", formatBRL(props.priceCents), true)}
</table>
</td>
</tr>
</table>

<!-- CTA -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="background:${EMAIL_COLOR.ink};">
<a href="${appUrl}/aluno/dashboard" style="display:inline-block;padding:14px 28px;color:${EMAIL_COLOR.paper};text-decoration:none;font-size:15px;font-weight:500;">
  Ver no dashboard
</a>
</td>
</tr>
</table>

<p style="margin:40px 0 0 0;font-size:14px;color:${EMAIL_COLOR.muted};line-height:1.6;">
  Precisa cancelar? Entre em contato com o suporte — cancelamentos pelos alunos passam pelo nosso atendimento.
</p>
`,
  });

  const text = `Sua aula está confirmada

Professor: ${props.teacherName}
Data: ${formattedDate}
Horário: ${formattedTime}
Total pago: ${formatBRL(props.priceCents)}
Código: ${shortId}

Ver no dashboard: ${appUrl}/aluno/dashboard

Precisa cancelar? Entre em contato com o suporte.
`;

  return { subject, html, text };
}

function row(label: string, value: string, emphasized = false): string {
  return `<tr>
<td style="padding:6px 0;font-size:14px;opacity:0.7;">${label}</td>
<td align="right" style="padding:6px 0;font-size:${emphasized ? "18px" : "14px"};${emphasized ? "font-family:Georgia,serif;" : ""}">${value}</td>
</tr>`;
}
