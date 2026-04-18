import type { AvailabilitySlot } from "@/lib/types";

export type SlotsByDay = {
  dayKey: string; // yyyy-mm-dd
  dayLabel: string;
  slots: AvailabilitySlot[];
}[];

/**
 * Agrupa slots por dia local (America/Sao_Paulo). Os slots já devem vir
 * ordenados por start_at asc.
 */
export function groupSlotsByDay(
  slots: AvailabilitySlot[],
  tz = "America/Sao_Paulo"
): SlotsByDay {
  const formatterKey = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  });
  const formatterLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: tz,
  });

  const map = new Map<string, { dayLabel: string; slots: AvailabilitySlot[] }>();

  for (const slot of slots) {
    const date = new Date(slot.start_at);
    const key = formatterKey.format(date);
    const existing = map.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      map.set(key, {
        dayLabel: formatterLabel.format(date),
        slots: [slot],
      });
    }
  }

  return Array.from(map.entries()).map(([dayKey, { dayLabel, slots }]) => ({
    dayKey,
    dayLabel,
    slots,
  }));
}
