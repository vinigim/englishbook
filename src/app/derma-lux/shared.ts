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
  lines.push("Passando para confirmar o aluguel do laser:");
  lines.push("");
  if (equipmentName) lines.push(`🔬 Equipamento: ${equipmentName}`);
  lines.push(`📅 Data: ${dt.day} (${dt.dow})`);
  lines.push(`🕑 Horário: ${r.start_time} às ${r.end_time}`);
  if (r.address) lines.push(`📍 Endereço: ${r.address}`);
  if (r.specialty) lines.push(`🩺 Especialidade: ${r.specialty}`);
  if (r.price != null) lines.push(`💰 Valor: ${fmtBRL(r.price)}`);
  if (r.tips_used) lines.push(`🔧 Ponteiras: ${r.tips_used}`);
  if (r.sterilized != null)
    lines.push(`🧼 Esterilização: ${r.sterilized ? "Sim" : "Não"}`);
  if (r.specialized_technique != null)
    lines.push(
      `🎯 Acompanha técnica especializada? ${
        r.specialized_technique ? "Sim" : "Não"
      }`
    );
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
