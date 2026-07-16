import type { ColumnRole } from "./types";

/** Remove acentos e baixa a caixa, para casar cabeçalhos de forma robusta. */
export function normalizeHeader(header: string): string {
  return String(header ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Aliases conhecidos por papel. A ordem importa: telefone é checado antes de
// nome para evitar que "nome do contato" roube uma coluna de telefone.
const ALIASES: Record<Exclude<ColumnRole, "custom">, string[]> = {
  phone: [
    "telefone",
    "celular",
    "whatsapp",
    "whats",
    "zap",
    "fone",
    "phone",
    "mobile",
    "numero",
    "num",
    "tel",
    "contato telefonico",
  ],
  name: [
    "nome",
    "name",
    "cliente",
    "contato",
    "responsavel",
    "primeiro nome",
    "nome completo",
    "full name",
    "first name",
    "lead",
  ],
  email: ["email", "e-mail", "mail", "correio"],
  company: [
    "empresa",
    "company",
    "razao social",
    "estabelecimento",
    "negocio",
    "organizacao",
  ],
};

/**
 * Tenta inferir o papel de uma coluna a partir do cabeçalho.
 * Retorna "custom" quando nada casa.
 */
export function detectRole(header: string): ColumnRole {
  const h = normalizeHeader(header);
  if (!h) return "custom";

  const order: Array<Exclude<ColumnRole, "custom">> = [
    "phone",
    "email",
    "company",
    "name",
  ];

  for (const role of order) {
    for (const alias of ALIASES[role]) {
      if (h === alias || h.includes(alias)) return role;
    }
  }
  return "custom";
}

/** Heurística de conteúdo: a coluna parece conter telefones? */
export function looksLikePhoneColumn(values: string[]): boolean {
  const sample = values.filter(Boolean).slice(0, 20);
  if (sample.length === 0) return false;
  let hits = 0;
  for (const v of sample) {
    const digits = String(v).replace(/\D/g, "");
    // Telefones brasileiros têm 10–13 dígitos (com/sem DDI e 9º dígito).
    if (digits.length >= 10 && digits.length <= 13) hits++;
  }
  return hits / sample.length >= 0.7;
}
