/**
 * Extrai o primeiro nome, capitalizado. Útil porque planilhas costumam trazer
 * o nome completo ("MARIA DA SILVA") e a mensagem fica mais natural com "Maria".
 */
export function firstName(fullName: string): string {
  const cleaned = String(fullName ?? "").trim();
  if (!cleaned) return "";
  const first = cleaned.split(/\s+/)[0];
  return capitalize(first);
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
