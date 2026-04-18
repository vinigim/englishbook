import { emailLayout, EMAIL_COLOR, escapeHtml } from "../layout";

export type DigestSlot = {
  teacherName: string;
  startAt: string;
};

export type DigestTeacherGroup = {
  teacherName: string;
  slots: { startAt: string; endAt: string }[];
};

type Props = {
  studentName: string;
  groups: DigestTeacherGroup[]; // já ordenados e com limite razoável
  totalSlots: number;
};

export function dailyAvailabilityEmail(props: Props): {
  subject: string;
  html: string;
  text: string;
} {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://englishbook.app";
  const firstName = props.studentName.split(" ")[0];
  const tz = "America/Sao_Paulo";

  const timeFmt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const dayFmt = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: tz,
  });

  const teacherBlocks = props.groups
    .map((g) => {
      // Agrupa slots por dia dentro de cada professor (até 10 slots)
      const byDay = new Map<string, string[]>();
      const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: tz,
      });

      for (const s of g.slots.slice(0, 10)) {
        const d = new Date(s.startAt);
        const key = dayKeyFmt.format(d);
        const arr = byDay.get(key) ?? [];
        arr.push(timeFmt.format(d));
        byDay.set(key, arr);
      }

      const dayRows = Array.from(byDay.entries())
        .map(([key, times]) => {
          const sampleDate = new Date(key + "T12:00:00Z");
          const dayLabel = dayFmt.format(sampleDate);
          return `<tr>
<td style="padding:6px 16px 6px 0;font-size:13px;color:${EMAIL_COLOR.muted};white-space:nowrap;vertical-align:top;text-transform:capitalize;">
  ${escapeHtml(dayLabel)}
</td>
<td style="padding:6px 0;font-size:14px;color:${EMAIL_COLOR.ink};">
  ${times.map(escapeHtml).join(" · ")}
</td>
</tr>`;
        })
        .join("");

      const more =
        g.slots.length > 10
          ? `<p style="margin:8px 0 0 0;font-size:12px;color:${EMAIL_COLOR.muted};font-style:italic;">e mais ${g.slots.length - 10} horários…</p>`
          : "";

      return `<div style="border-top:1px solid ${EMAIL_COLOR.line};padding:20px 0;">
<h3 style="margin:0 0 12px 0;font-family:Georgia,serif;font-size:20px;letter-spacing:-0.3px;color:${EMAIL_COLOR.ink};font-weight:normal;">
  ${escapeHtml(g.teacherName)}
</h3>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
${dayRows}
</table>
${more}
</div>`;
    })
    .join("");

  const subject =
    props.totalSlots === 1
      ? `1 novo horário disponível hoje`
      : `${props.totalSlots} novos horários disponíveis hoje`;

  const html = emailLayout({
    preview: `Horários abertos dos seus professores favoritos`,
    title: subject,
    children: `
<p style="margin:0 0 8px 0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${EMAIL_COLOR.muted};">
  Boa manhã, ${escapeHtml(firstName)}
</p>
<h1 style="margin:0 0 16px 0;font-family:Georgia,serif;font-size:32px;line-height:1.15;letter-spacing:-0.5px;color:${EMAIL_COLOR.ink};font-weight:normal;">
  Horários <em style="color:${EMAIL_COLOR.accent};">abertos</em> hoje.
</h1>

<p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:${EMAIL_COLOR.muted};">
  Dos seus professores favoritos, para os próximos 7 dias. Reserve o que preferir.
</p>

${teacherBlocks}

<!-- CTA -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:32px;">
<tr>
<td style="background:${EMAIL_COLOR.ink};">
<a href="${appUrl}/aluno/agendar" style="display:inline-block;padding:14px 28px;color:${EMAIL_COLOR.paper};text-decoration:none;font-size:15px;font-weight:500;">
  Ver todos os horários
</a>
</td>
</tr>
</table>

<p style="margin:40px 0 0 0;font-size:13px;color:${EMAIL_COLOR.muted};line-height:1.6;">
  Não quer mais receber este e-mail?
  <a href="${appUrl}/aluno/preferencias" style="color:${EMAIL_COLOR.ink};text-decoration:underline;">Desativar em preferências</a>.
</p>
`,
  });

  const textLines = [
    `Boa manhã, ${firstName}`,
    "",
    `Horários abertos hoje (próximos 7 dias):`,
    "",
  ];
  for (const g of props.groups) {
    textLines.push(`— ${g.teacherName}`);
    for (const s of g.slots.slice(0, 10)) {
      const d = new Date(s.startAt);
      textLines.push(`  ${dayFmt.format(d)} às ${timeFmt.format(d)}`);
    }
    if (g.slots.length > 10) {
      textLines.push(`  …e mais ${g.slots.length - 10}`);
    }
    textLines.push("");
  }
  textLines.push(`Ver todos: ${appUrl}/aluno/agendar`);
  textLines.push(
    `Cancelar estes e-mails: ${appUrl}/aluno/preferencias`
  );

  return { subject, html, text: textLines.join("\n") };
}
