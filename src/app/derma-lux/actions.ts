"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; error?: string };

async function requireSupabase() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return supabase;
}

function revalidateAll() {
  revalidatePath("/derma-lux");
  revalidatePath("/derma-lux/disponibilidade");
  revalidatePath("/derma-lux/equipamentos");
}

// ============================================================================
// FECHAMENTO / BLOQUEIO DE AGENDA
// ============================================================================
const blockSchema = z.object({
  equip_id: z.string().uuid("Selecione um equipamento"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  period: z.enum(["full", "morning", "afternoon"]),
  note: z.string().trim().nullish(),
});

export async function createBlock(input: unknown): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { error } = await supabase.from("blocks").insert({
    equip_id: parsed.data.equip_id,
    date: parsed.data.date,
    period: parsed.data.period,
    note: parsed.data.note || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function deleteBlock(id: string): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }
  const { error } = await supabase.from("blocks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

// ============================================================================
// ALUGUÉIS
// ============================================================================
const rentalSchema = z
  .object({
    id: z.string().uuid().nullish(),
    client: z.string().trim().min(1, "Informe o cliente"),
    address: z.string().trim().min(1, "Informe o endereço"),
    phone: z.string().trim().nullish(),
    equip_id: z.string().uuid("Selecione um equipamento"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Início inválido"),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, "Término inválido"),
    price: z.number().nullish(),
    freight_price: z.number().nullish(),
    technique_price: z.number().nullish(),
    notes: z.string().trim().nullish(),
    specialty: z.string().trim().nullish(),
    tips_used: z.string().trim().nullish(),
    sterilized: z.boolean().nullish(),
    specialized_technique: z.boolean().nullish(),
  })
  .refine((d) => d.end_time > d.start_time, {
    message: "O término deve ser depois do início",
    path: ["end_time"],
  });

export async function saveRental(input: unknown): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const parsed = rentalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { id, ...rest } = parsed.data;
  const row = {
    client: rest.client,
    address: rest.address,
    phone: rest.phone || null,
    equip_id: rest.equip_id,
    date: rest.date,
    start_time: rest.start_time,
    end_time: rest.end_time,
    price: rest.price ?? null,
    freight_price: rest.freight_price ?? null,
    technique_price: rest.technique_price ?? null,
    notes: rest.notes || null,
    specialty: rest.specialty || null,
    tips_used: rest.tips_used || null,
    sterilized: rest.sterilized ?? null,
    specialized_technique: rest.specialized_technique ?? null,
  };

  const { error } = id
    ? await supabase.from("rentals").update(row).eq("id", id)
    : await supabase.from("rentals").insert(row);

  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function deleteRental(id: string): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }
  const { error } = await supabase.from("rentals").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

// ============================================================================
// EQUIPAMENTOS
// ============================================================================
const equipSchema = z.object({
  id: z.string().uuid().nullish(),
  name: z.string().trim().min(1, "Informe o nome"),
  use: z.string().trim().nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
});

export async function saveEquipment(input: unknown): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };

  const parsed = equipSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { id, ...rest } = parsed.data;
  const row = { name: rest.name, use: rest.use || null, color: rest.color };

  const { error } = id
    ? await supabase.from("equipment").update(row).eq("id", id)
    : await supabase.from("equipment").insert(row);

  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}

export async function deleteEquipment(id: string): Promise<ActionResult> {
  const supabase = await requireSupabase();
  if (!supabase) return { ok: false, error: "Sessão expirada. Entre novamente." };
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "ID inválido." };
  }
  // rentals.equip_id tem ON DELETE CASCADE — os aluguéis do laser saem junto.
  const { error } = await supabase.from("equipment").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}
