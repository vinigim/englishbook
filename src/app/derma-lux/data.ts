import { createClient } from "@/lib/supabase/server";
import type { Block, BlockPeriod, Equipment, Rental } from "./types";

type RawRental = {
  id: string;
  client: string;
  address: string;
  phone: string | null;
  equip_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  price: number | string | null;
  freight_price: number | string | null;
  technique_price: number | string | null;
  notes: string | null;
  specialty: string | null;
  tips_used: string | null;
  sterilized: boolean | null;
  specialized_technique: boolean | null;
};

function toRental(r: RawRental): Rental {
  return {
    id: r.id,
    client: r.client,
    address: r.address,
    phone: r.phone ?? null,
    equip_id: r.equip_id ?? null,
    date: r.date,
    start_time: String(r.start_time).slice(0, 5),
    end_time: String(r.end_time).slice(0, 5),
    price: r.price != null ? Number(r.price) : null,
    freight_price: r.freight_price != null ? Number(r.freight_price) : null,
    technique_price: r.technique_price != null ? Number(r.technique_price) : null,
    notes: r.notes ?? null,
    specialty: r.specialty ?? null,
    tips_used: r.tips_used ?? null,
    sterilized: r.sterilized ?? null,
    specialized_technique: r.specialized_technique ?? null,
  };
}

type RawBlock = {
  id: string;
  equip_id: string | null;
  date: string;
  period: string | null;
  note: string | null;
};

function toBlock(b: RawBlock): Block {
  const period = (b.period ?? "full") as BlockPeriod;
  return {
    id: b.id,
    equip_id: b.equip_id ?? null,
    date: b.date,
    period: ["full", "morning", "afternoon"].includes(period) ? period : "full",
    note: b.note ?? null,
  };
}

export async function getDermaLuxData(): Promise<{
  equipment: Equipment[];
  rentals: Rental[];
  blocks: Block[];
}> {
  const supabase = await createClient();
  const [eqRes, rtRes, blRes] = await Promise.all([
    supabase.from("equipment").select("*").order("created_at", { ascending: true }),
    supabase.from("rentals").select("*"),
    supabase.from("blocks").select("*"),
  ]);

  const equipment = (eqRes.data ?? []) as Equipment[];
  const rentals = ((rtRes.data ?? []) as RawRental[]).map(toRental);
  // Se a tabela blocks ainda não existir (migração não rodada), blRes.data vem
  // null e caímos em [] sem quebrar a página.
  const blocks = ((blRes.data ?? []) as RawBlock[]).map(toBlock);
  return { equipment, rentals, blocks };
}
