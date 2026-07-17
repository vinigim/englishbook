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
    notes: z.string().trim().nullish(),
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
    notes: rest.notes || null,
  };

  const { error } = id
    ? await supabase.from("dl_rentals").update(row).eq("id", id)
    : await supabase.from("dl_rentals").insert(row);

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
  const { error } = await supabase.from("dl_rentals").delete().eq("id", id);
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
    ? await supabase.from("dl_equipment").update(row).eq("id", id)
    : await supabase.from("dl_equipment").insert(row);

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
  // dl_rentals.equip_id tem ON DELETE CASCADE — os aluguéis do laser saem junto.
  const { error } = await supabase.from("dl_equipment").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true };
}
