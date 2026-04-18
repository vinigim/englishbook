/**
 * Layout base de e-mail. Todos os templates usam esta função para
 * herdar header/footer e estilo consistente.
 *
 * Clientes de e-mail (Gmail, Outlook, Apple Mail) têm suporte inconsistente
 * a CSS moderno. Usamos tabelas + estilos inline pra compatibilidade.
 */

type LayoutOptions = {
  preview?: string;
  title: string;
  children: string;
};

const COLOR = {
  ink: "#1a1a1a",
  paper: "#faf7f2",
  accent: "#d4421a",
  muted: "#6b6560",
  line: "#e8e2d9",
};

export function emailLayout({ preview, title, children }: LayoutOptions): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://englishbook.app";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${COLOR.ink};">
${preview ? `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${escapeHtml(preview)}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${COLOR.paper};">
<tr>
<td align="center" style="padding:40px 16px;">

<!-- Container -->
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">

<!-- Header -->
<tr>
<td style="padding:0 0 32px 0;">
<a href="${appUrl}" style="text-decoration:none;color:${COLOR.ink};">
<span style="font-family:Georgia,serif;font-size:22px;font-weight:600;letter-spacing:-0.5px;">EnglishBook</span>
</a>
</td>
</tr>

<!-- Content -->
<tr>
<td style="background:${COLOR.paper};">
${children}
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:40px 0 0 0;border-top:1px solid ${COLOR.line};margin-top:40px;">
<p style="margin:24px 0 0 0;font-size:12px;color:${COLOR.muted};line-height:1.6;">
EnglishBook — aulas de inglês sob medida.<br>
Você recebeu este e-mail porque tem uma conta em <a href="${appUrl}" style="color:${COLOR.ink};text-decoration:underline;">englishbook.app</a>.
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}

export { COLOR as EMAIL_COLOR };

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
