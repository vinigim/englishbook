// Títulos/pronomes de tratamento que devem ser ignorados ao pegar o 1º nome.
const TITLES = new Set([
  "dr",
  "dra",
  "sr",
  "sra",
  "srta",
  "prof",
  "profa",
  "dro",
  "exmo",
  "exma",
]);

/**
 * Extrai o primeiro nome, capitalizado, pulando títulos de tratamento.
 * Ex.: "MARIA DA SILVA" -> "Maria"; "Dra. Nayara Scardovelli" -> "Nayara".
 * Se sobrar só o título (nome vazio), devolve o título capitalizado.
 */
export function firstName(fullName: string): string {
  const cleaned = String(fullName ?? "").trim();
  if (!cleaned) return "";
  const tokens = cleaned.split(/\s+/);
  for (const token of tokens) {
    const bare = token.replace(/\.$/, "").toLowerCase();
    if (!TITLES.has(bare)) return capitalize(token);
  }
  return capitalize(tokens[0]);
}

export function capitalize(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Renderiza o corpo do template substituindo {{1}}, {{2}}, ... pelas variáveis.
 * Usado APENAS para o preview no front — o envio real usa o template
 * armazenado e aprovado na Meta.
 */
export function renderTemplateBody(body: string, variables: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, num) => {
    const idx = Number(num) - 1;
    return variables[idx] ?? `{{${num}}}`;
  });
}

/** Conta quantas variáveis {{n}} distintas existem no corpo do template. */
export function countTemplateVariables(body: string): number {
  const found = new Set<number>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    found.add(Number(m[1]));
  }
  return found.size;
}
