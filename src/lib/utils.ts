import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function formatDateTime(iso: string, tz = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: tz,
  }).format(new Date(iso));
}

export function formatTime(iso: string, tz = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short",
    timeZone: tz,
  }).format(new Date(iso));
}

export function formatDate(iso: string, tz = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: tz,
  }).format(new Date(iso));
}

export function monthLabel(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}
