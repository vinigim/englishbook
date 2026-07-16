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

// Radicais longos e inequívocos: casam como SUBSTRING de uma palavra
// (ex.: "dermato" dentro de "dermatofuncional").
const COMPANY_STEMS = [
  "clinic",
  "estetic",
  "odonto",
  "dermato",
  "instituto",
  "consultorio",
  "harmoni",
  "studio",
  "eireli",
];

// Termos curtos/ambíguos: só casam como PALAVRA exata, para não bater dentro
// de sobrenomes (ex.: "mei" em "Meire", "spa" em "Spartaco").
const COMPANY_WORDS = [
  "centro",
  "espaco",
  "spa",
  "ltda",
  "mei",
  "laser",
  "protocolo",
];

function stripAccentsLower(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Heurística: o valor parece ser nome de EMPRESA (e não de pessoa)?
 * Usado só para exibir um aviso — nunca bloqueia o envio.
 *
 * Regra: se começa com um título de tratamento (Dr., Dra., ...) tratamos como
 * pessoa; caso contrário, procuramos palavras típicas de estabelecimento ou
 * separadores de marca ("|"). Por ser um alerta, preferimos avisar a mais.
 */
export function looksLikeCompanyName(value: string): boolean {
  const norm = stripAccentsLower(value);
  if (!norm) return false;

  const firstToken = norm.split(/\s+/)[0].replace(/\.$/, "");
  if (TITLES.has(firstToken)) return false; // tem título -> é pessoa

  if (norm.includes("|")) return true;

  const words = norm.split(/[^a-z0-9]+/).filter(Boolean);
  return words.some(
    (w) =>
      COMPANY_WORDS.includes(w) ||
      COMPANY_STEMS.some((stem) => w.includes(stem)),
  );
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
