export type BookingLike = {
  scheduled_start_at: string;
  [key: string]: unknown;
};

export function groupBookingsByMonth<T extends BookingLike>(
  bookings: T[],
  tz = "America/Sao_Paulo"
): { monthKey: string; monthLabel: string; items: T[] }[] {
  const keyFmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: tz,
  });
  const labelFmt = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: tz,
  });

  const map = new Map<string, { label: string; items: T[] }>();
  for (const b of bookings) {
    const d = new Date(b.scheduled_start_at);
    const key = keyFmt.format(d); // "2026-04"
    const existing = map.get(key);
    if (existing) {
      existing.items.push(b);
    } else {
      map.set(key, { label: labelFmt.format(d), items: [b] });
    }
  }

  return Array.from(map.entries()).map(([monthKey, { label, items }]) => ({
    monthKey,
    monthLabel: label,
    items,
  }));
}
