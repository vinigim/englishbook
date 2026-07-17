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
