import type { Rental } from "./types";

// Paleta alinhada à identidade (paper/ink/accent) para os equipamentos.
export const PALETTE = [
  "#d4421a",
  "#1a1a1a",
  "#2f6f4f",
  "#b0851f",
  "#3b5b8c",
  "#8a3ffc",
  "#0f766e",
  "#a83254",
];

const DOW = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function fmtDayHeading(iso: string): { day: string; dow: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { day: `${d} de ${MONTHS[m - 1]}`, dow: DOW[dt.getDay()] };
}

export function minutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fmtMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(
    2,
    "0"
  )}`;
}

export function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseBRL(v: string): number | null {
  if (v == null || v.trim() === "") return null;
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}

export function checkConflict(
  rentals: Rental[],
  equipId: string,
  date: string,
  start: string,
  end: string,
  ignoreId?: string | null
): boolean {
  const s = minutes(start);
  const e = minutes(end);
  return rentals.some(
    (r) =>
      r.id !== ignoreId &&
      r.equip_id === equipId &&
      r.date === date &&
      overlaps(s, e, minutes(r.start_time), minutes(r.end_time))
  );
}

/**
 * Converte o telefone digitado para o formato do WhatsApp (só dígitos, com
 * código do país). Assume Brasil (55) quando não há código. Retorna null se
 * não houver dígitos suficientes.
 */
export function toWhatsAppNumber(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return null;
  if (d.startsWith("55") && d.length >= 12) return d; // já tem DDI
  if (d.length === 10 || d.length === 11) return "55" + d; // DDD + número
  return d; // fallback: usa como veio
}

/** Monta a mensagem de confirmação do aluguel para o WhatsApp. */
export function buildConfirmationMessage(
  r: Rental,
  equipmentName: string | null
): string {
  const dt = fmtDayHeading(r.date);
  const lines: string[] = [];
  lines.push(`Olá, ${r.client}! 👋`);
  lines.push("");
  lines.push("Passando para te lembrar do aluguel do laser:");
  lines.push("");
  if (equipmentName) lines.push(`🔬 Equipamento: ${equipmentName}`);
  lines.push(`📅 Data: ${dt.day} (${dt.dow})`);
  lines.push(`🕑 Horário: ${r.start_time} às ${r.end_time}`);
  if (r.address) lines.push(`📍 Endereço: ${r.address}`);
  if (r.specialty) lines.push(`🩺 Especialidade: ${r.specialty}`);
  if (r.tips_used) lines.push(`🔧 Ponteiras: ${r.tips_used}`);
  if (r.sterilized != null)
    lines.push(`🧼 Esterilização: ${r.sterilized ? "Sim" : "Não"}`);
  if (r.freddo === true) lines.push("❄️ Acompanha resfriador Freddo");
  if (r.specialized_technique != null)
    lines.push(
      `🎯 Acompanha técnica especializada? ${
        r.specialized_technique ? "Sim" : "Não"
      }`
    );

  // Bloco de valores + total
  const showTech = r.specialized_technique === true && r.technique_price != null;
  const techValue = showTech ? (r.technique_price as number) : 0;
  const showFreddo = r.freddo === true && r.freddo_price != null;
  const freddoValue = showFreddo ? (r.freddo_price as number) : 0;
  if (r.price != null || r.freight_price != null || showTech || showFreddo) {
    lines.push("");
    if (r.price != null) lines.push(`💰 Valor do aluguel: ${fmtBRL(r.price)}`);
    if (r.freight_price != null)
      lines.push(
        r.freight_price === 0
          ? "🚚 Frete: Isento"
          : `🚚 Frete: ${fmtBRL(r.freight_price)}`
      );
    if (showTech)
      lines.push(
        `💠 Técnica especializada: ${fmtBRL(r.technique_price as number)}`
      );
    if (showFreddo)
      lines.push(`❄️ Resfriador Freddo: ${fmtBRL(r.freddo_price as number)}`);
    const total =
      (r.price ?? 0) + (r.freight_price ?? 0) + techValue + freddoValue;
    lines.push(`🧾 *Valor total: ${fmtBRL(total)}*`);
  }

  lines.push("");
  lines.push(
    "🕧 Nossa equipe chega sempre com 30 minutos de antecedência para inspeção do local e instalação do equipamento."
  );
  lines.push("");
  lines.push(
    "Se possível, nos informe um contato para auxiliar na recepção do equipamento. 🙏"
  );
  lines.push("");
  lines.push("Podemos confirmar?");
  return lines.join("\n");
}

export function whatsAppUrl(r: Rental, equipmentName: string | null): string | null {
  const number = toWhatsAppNumber(r.phone);
  if (!number) return null;
  const text = encodeURIComponent(buildConfirmationMessage(r, equipmentName));
  return `https://wa.me/${number}?text=${text}`;
}

export function groupByDate(rentals: Rental[]): Record<string, Rental[]> {
  const groups: Record<string, Rental[]> = {};
  for (const r of rentals) {
    (groups[r.date] = groups[r.date] || []).push(r);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
  }
  return groups;
}

// ============================================================================
// Histórico de frete — quanto já se cobrou para o mesmo cliente ou cidade
// ============================================================================

/** "São José do Rio Preto" -> "sao jose do rio preto". */
function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type FreteAnterior = {
  id: string;
  date: string;
  client: string;
  freight_price: number;
};

export type HistoricoFrete = {
  cliente: FreteAnterior[];
  cidade: string | null;
  naCidade: FreteAnterior[];
};

/**
 * A cidade de um endereço digitado agora, procurada só entre as cidades que
 * já aparecem nos aluguéis: o cálculo completo (`cidadeDoEndereco`) usa a
 * tabela do IBGE, que é só do servidor, e cidade sem aluguel anterior não
 * teria histórico de qualquer jeito.
 */
export function cidadeConhecida(
  endereco: string,
  cidades: string[]
): string | null {
  const alvo = ` ${semAcento(endereco)} `;
  let melhor: string | null = null;
  for (const c of cidades) {
    const nome = semAcento(c.split("/")[0]);
    if (!nome || !alvo.includes(` ${nome} `)) continue;
    if (!melhor || nome.length > semAcento(melhor.split("/")[0]).length) melhor = c;
  }
  return melhor;
}

/**
 * Fretes já cobrados para o mesmo cliente (nome igual, sem diferenciar
 * maiúsculas) e para outros clientes da mesma cidade, do mais recente para
 * o mais antigo. O próprio aluguel em edição fica de fora.
 */
export function historicoFrete(
  rentals: Rental[],
  atual: { id?: string | null; client: string; address: string; city?: string | null }
): HistoricoFrete {
  const comFrete = rentals
    .filter((r) => r.id !== atual.id && r.freight_price != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  const item = (r: Rental): FreteAnterior => ({
    id: r.id,
    date: r.date,
    client: r.client,
    freight_price: r.freight_price as number,
  });

  const nome = atual.client.trim().toLowerCase();
  const cliente = nome
    ? comFrete.filter((r) => r.client.trim().toLowerCase() === nome).map(item)
    : [];

  const cidades = [...new Set(comFrete.map((r) => r.city).filter(Boolean))] as string[];
  const cidade =
    atual.city ?? (atual.address.trim() ? cidadeConhecida(atual.address, cidades) : null);
  const naCidade = cidade
    ? comFrete
        .filter((r) => r.city === cidade && r.client.trim().toLowerCase() !== nome)
        .map(item)
    : [];

  return { cliente, cidade, naCidade };
}

export function fmtDataCurta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
