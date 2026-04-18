"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addMinutes, parse, isValid } from "date-fns";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// SHARED
// ============================================================================
export type AvailabilityState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  created?: number; // quantos slots foram criados
};

const DEFAULT_TZ = "America/Sao_Paulo";

/**
 * Constrói uma data UTC a partir de um date ("2026-04-22") e uma hora
 * ("14:00") no timezone do usuário. Retorna Date em UTC pronto pra ISOString.
 */
function buildUtcDate(
  dateStr: string,
  timeStr: string,
  tz: string
): Date | null {
  // Valida formatos básicos
  const naive = parse(`${dateStr} ${timeStr}`, "yyyy-MM-dd HH:mm", new Date());
  if (!isValid(naive)) return null;
  return fromZonedTime(naive, tz);
}

// ============================================================================
// CRIAR SLOT ÚNICO
// ============================================================================
const singleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
  duration_minutes: z.coerce.number().int().min(15).max(240),
});

export async function createSingleSlotAction(
  _prev: AvailabilityState,
  formData: FormData
): Promise<AvailabilityState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = singleSchema.safeParse({
    date: formData.get("date"),
    time: formData.get("time"),
    duration_minutes: formData.get("duration_minutes"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    return { fieldErrors };
  }

  const tz = DEFAULT_TZ; // futuramente: pegar de profile.timezone
  const startUtc = buildUtcDate(parsed.data.date, parsed.data.time, tz);
  if (!startUtc) return { error: "Data/hora inválida." };

  if (startUtc.getTime() <= Date.now() + 5 * 60 * 1000) {
    return { error: "Escolha um horário pelo menos 5 minutos no futuro." };
  }

  const endUtc = addMinutes(startUtc, parsed.data.duration_minutes);

  const { error } = await supabase.from("availability_slots").insert({
    teacher_id: user.id,
    start_at: startUtc.toISOString(),
    end_at: endUtc.toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Você já tem um horário cadastrado nesse momento." };
    }
    return { error: error.message };
  }

  revalidatePath("/professor/disponibilidade");
  revalidatePath("/professor/dashboard");
  return { ok: true, created: 1 };
}

// ============================================================================
// CRIAR SLOTS EM LOTE (recorrência semanal)
// ============================================================================
const daysEnum = z.enum(["0", "1", "2", "3", "4", "5", "6"]); // 0=domingo
const bulkSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().min(15).max(240),
  weeks: z.coerce.number().int().min(1).max(12),
  days_of_week: z.array(daysEnum).min(1, "Escolha ao menos um dia"),
});

export async function createBulkSlotsAction(
  _prev: AvailabilityState,
  formData: FormData
): Promise<AvailabilityState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const daysOfWeek = formData.getAll("days_of_week").map(String);
  const parsed = bulkSchema.safeParse({
    start_date: formData.get("start_date"),
    time: formData.get("time"),
    duration_minutes: formData.get("duration_minutes"),
    weeks: formData.get("weeks"),
    days_of_week: daysOfWeek,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    return { fieldErrors };
  }

  const tz = DEFAULT_TZ;
  const firstDate = buildUtcDate(parsed.data.start_date, parsed.data.time, tz);
  if (!firstDate) return { error: "Data inválida." };

  const targetDays = new Set(parsed.data.days_of_week.map(Number));
  const durationMin = parsed.data.duration_minutes;
  const weeks = parsed.data.weeks;
  const now = Date.now();

  // Janela total em dias: weeks * 7, começando da start_date
  const totalDays = weeks * 7;
  const slots: { start: Date; end: Date }[] = [];

  // Para descobrir o dia da semana de uma data UTC no tz do usuário,
  // usamos Intl com a parte "weekday" e convertemos para índice 0-6.
  const weekdayFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: tz,
  });
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };

  for (let d = 0; d < totalDays; d++) {
    // Cada "dia" é +24h em relação ao firstDate (que já carrega a hora correta no UTC)
    const candidate = new Date(firstDate.getTime() + d * 24 * 60 * 60 * 1000);
    // Normaliza horário de verão: reconstrói a partir da data local + hora
    // (para cobrir o raro caso de DST mudar o offset entre semanas)
    const isoDate = new Intl.DateTimeFormat("en-CA", {
      year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz,
    }).format(candidate);
    const reNormalized = buildUtcDate(isoDate, parsed.data.time, tz);
    if (!reNormalized) continue;

    const weekdayShort = weekdayFmt.format(reNormalized);
    const weekdayIdx = weekdayMap[weekdayShort];
    if (!targetDays.has(weekdayIdx)) continue;

    if (reNormalized.getTime() <= now + 5 * 60 * 1000) continue;

    const end = addMinutes(reNormalized, durationMin);
    slots.push({ start: reNormalized, end });
  }

  if (slots.length === 0) {
    return { error: "Nenhum horário válido no futuro para essa configuração." };
  }

  // Dedup pelo timestamp antes de mandar pro banco
  const seen = new Set<string>();
  const unique = slots.filter((s) => {
    const k = s.start.toISOString();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Insere com ignoreDuplicates — o unique index (teacher_id, start_at)
  // vai rejeitar slots que já existem
  const rows = unique.map((s) => ({
    teacher_id: user.id,
    start_at: s.start.toISOString(),
    end_at: s.end.toISOString(),
  }));

  // Supabase não tem "ON CONFLICT DO NOTHING" direto, mas upsert + onConflict
  // com ignoreDuplicates resolve
  const { data, error } = await supabase
    .from("availability_slots")
    .upsert(rows, {
      onConflict: "teacher_id,start_at",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) return { error: error.message };

  revalidatePath("/professor/disponibilidade");
  revalidatePath("/professor/dashboard");
  return { ok: true, created: data?.length ?? 0 };
}

// ============================================================================
// DELETAR SLOT
// ============================================================================
const deleteSchema = z.object({
  slot_id: z.string().uuid(),
});

export async function deleteSlotAction(
  _prev: AvailabilityState,
  formData: FormData
): Promise<AvailabilityState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const parsed = deleteSchema.safeParse({ slot_id: formData.get("slot_id") });
  if (!parsed.success) return { error: "ID inválido." };

  // RLS já impede deletar slot de outro professor, e a policy slots_delete_own_teacher
  // só permite delete quando status = 'available'. Se o delete não afetar linhas,
  // é provavelmente porque o slot não está mais available.
  const { data, error } = await supabase
    .from("availability_slots")
    .delete()
    .eq("id", parsed.data.slot_id)
    .eq("teacher_id", user.id)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return {
      error:
        "Esse horário não pode mais ser removido (provavelmente já foi reservado).",
    };
  }

  revalidatePath("/professor/disponibilidade");
  return { ok: true };
}
