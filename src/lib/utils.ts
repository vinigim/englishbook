import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Junta classes do Tailwind resolvendo conflitos (a última vence).
 *
 * É o único utilitário global que sobrou: as funções de formatação de data e
 * moeda que existiam aqui eram do EnglishBook. A agenda tem as suas próprias,
 * em src/app/derma-lux/shared.ts (fmtBRL, fmtDayHeading, fmtMin), e o Radar de
 * Leads em src/app/derma-lux/leads-shared.ts (formatPhoneBR, relativeDays).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
