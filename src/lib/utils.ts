export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const TZ = "America/Sao_Paulo";

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  // Datas puras (AAAA-MM-DD) não têm fuso: não converter.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
  }
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ });
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
}

export function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function diasDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
