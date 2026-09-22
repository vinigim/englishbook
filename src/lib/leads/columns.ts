import type { ColumnRole } from "./sheet-types";

/** Remove acentos e baixa a caixa, para casar cabeçalhos de forma robusta. */
export function normalizeHeader(header: string): string {
  return String(header ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

type Role = Exclude<ColumnRole, "custom">;

// Aliases que casam por SUBSTRING — inequívocos o bastante para aparecer dentro
// de cabeçalhos compostos (ex: "telefone comercial", "nome completo").
const SUBSTRING_ALIASES: Record<Role, string[]> = {
  phone: [
    "telefone",
    "celular",
    "whatsapp",
    "whats",
    "zap",
    "fone",
    "mobile",
    "contato telefonico",
  ],
  name: ["nome", "name", "primeiro nome", "nome completo", "full name", "first name"],
  email: ["email", "e-mail", "correio"],
  company: [
    "empresa",
    "company",
    "razao social",
    "estabelecimento",
    "negocio",
    "organizacao",
    "clinica",
    "consultorio",
  ],
  specialty: ["especialidade", "especialidades", "area de atuacao", "atuacao"],
  city: ["cidade", "municipio", "localidade"],
  instagram: ["instagram", "insta", "perfil do instagram"],
};

// Aliases ambíguos/curtos — só casam se o cabeçalho for EXATAMENTE isso.
// Evita que "Status do Contato" ou "Data do Contato" virem "nome" só por
// conterem a palavra "contato".
const EXACT_ALIASES: Record<Role, string[]> = {
  phone: ["numero", "num", "tel", "phone"],
  name: ["cliente", "contato", "responsavel", "lead", "medico", "doutor", "dra"],
  email: ["mail"],
  company: [],
  specialty: ["area"],
  city: ["uf", "estado"],
  instagram: ["ig", "arroba", "rede social", "redes sociais"],
};

// Ordem importa: papéis mais específicos primeiro, "name" por último, porque
// "nome" aparece dentro de muitos cabeçalhos compostos.
//
// `phone` vem antes de `instagram` de propósito: num cabeçalho misto como
// "WhatsApp / Instagram" o telefone tem que ganhar, porque é ele que
// identifica o lead — sem telefone a linha inteira é descartada.
const ROLE_ORDER: Role[] = [
  "phone",
  "instagram",
  "email",
  "specialty",
  "city",
  "company",
  "name",
];

/**
 * Tenta inferir o papel de uma coluna a partir do cabeçalho.
 * Retorna "custom" quando nada casa.
 */
export function detectRole(header: string): ColumnRole {
  const h = normalizeHeader(header);
  if (!h) return "custom";

  // 1) Correspondência exata primeiro (mais confiável).
  for (const role of ROLE_ORDER) {
    if (SUBSTRING_ALIASES[role].includes(h)) return role;
    if (EXACT_ALIASES[role].includes(h)) return role;
  }

  // 2) Correspondência por substring, só para aliases inequívocos.
  for (const role of ROLE_ORDER) {
    for (const alias of SUBSTRING_ALIASES[role]) {
      if (h.includes(alias)) return role;
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

const COMPANY_HINTS = [
  "clinica",
  "clínica",
  "instituto",
  "centro",
  "hospital",
  "ltda",
  "me",
  "espaco",
  "espaço",
  "derma",
  "estetica",
  "estética",
];

/**
 * O nome parece de uma pessoa ou de um estabelecimento? Alimenta o campo
 * `lead_kind` — saber se falamos com um médico ou com uma clínica muda o tom
 * da mensagem que a IA redige.
 */
export function looksLikeCompanyName(name: string): boolean {
  const n = normalizeHeader(name);
  if (!n) return false;
  return COMPANY_HINTS.some((hint) => n.includes(normalizeHeader(hint)));
}
