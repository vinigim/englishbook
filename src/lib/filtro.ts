import type { Modelo } from "./tipos";

// ---------------------------------------------------------------------
// Pré-filtro barato, antes da IA. Uma vaga só segue para a triagem se
// citar alguma tecnologia de mainframe IBM no título ou na descrição.
// "db2" sozinho não entra: existe DB2 LUW fora do mainframe; a IA decide.
// ---------------------------------------------------------------------
const TERMOS_MAINFRAME = [
  /\bmainframe\b/i,
  /\bcobol\b/i,
  /\bcics\b/i,
  /\bjcl\b/i,
  /\bz\/?os\b/i,
  /\bmvs\b/i,
  /\btso\b/i,
  /\bispf\b/i,
  /\bvsam\b/i,
  /\bims\s?(db|dc|tm)?\b/i,
  /\bnatural\b.{0,20}\badabas\b|\badabas\b/i,
  /\bpl\/?i\b|\bpl\/1\b/i,
  /\brexx\b/i,
  /\beasytrieve\b/i,
  /\bendevor\b/i,
  /\bchangeman\b/i,
  /\bhlasm\b|\bassembler\s+(ibm|370|390|z)\b/i,
  /\balta\s+plataforma\b/i,
  /\bibm\s+z\b|\bz(14|15|16|17)\b|\bzseries\b|\bsystem\s+z\b/i,
  /\bdb2\s+(z|for\s+z)/i,
];

export function citaMainframe(texto: string): boolean {
  return TERMOS_MAINFRAME.some((re) => re.test(texto));
}

// Títulos que com certeza estão abaixo de sênior: nem gastamos IA com eles.
const ABAIXO_DE_SENIOR = /\b(est[aá]gi(o|[aá]ri[oa])|trainee|aprendiz|j[uú]nior|jr|intern(ship)?)\b/i;

export function claramenteJunior(titulo: string): boolean {
  return ABAIXO_DE_SENIOR.test(titulo);
}

// ---------------------------------------------------------------------
// Deduplicação: a mesma vaga chega pela Gupy e por um alerta do LinkedIn.
// ---------------------------------------------------------------------
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(ltda|s\.?a\.?|inc|brasil|brazil)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function chaveVaga(titulo: string, empresa: string): string {
  return `${normalizar(titulo)}|${normalizar(empresa)}`;
}

// ---------------------------------------------------------------------
// HTML → texto (descrições da Gupy/Greenhouse e corpo dos e-mails)
// ---------------------------------------------------------------------
const ENTIDADES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
};

export function decodificarEntidades(s: string): string {
  return s
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** Remove tags. Com `manterLinks`, `<a href="u">t</a>` vira `t [u]`. */
export function htmlParaTexto(html: string, manterLinks = false): string {
  let s = html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|table)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  if (manterLinks) {
    s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, texto) => {
      const t = texto.replace(/<[^>]+>/g, " ").trim();
      return ` ${t} [${decodificarEntidades(url)}] `;
    });
  }
  s = decodificarEntidades(s.replace(/<[^>]+>/g, " "));
  return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

export function inferirModelo(texto: string): Modelo {
  if (/\b(100%\s*)?remot[oa]\b|\bremote\b|home\s?office|anywhere/i.test(texto)) return "remoto";
  if (/\bh[ií]brid[oa]\b|\bhybrid\b/i.test(texto)) return "hibrido";
  if (/\bpresencial\b|\bon[- ]?site\b/i.test(texto)) return "presencial";
  return "desconhecido";
}
