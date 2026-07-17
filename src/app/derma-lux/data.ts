import { createClient } from "@/lib/supabase/server";
import type { Equipment, Rental } from "./types";

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
  notes: string | null;
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
    notes: r.notes ?? null,
  };
}

export async function getDermaLuxData(): Promise<{
  equipment: Equipment[];
  rentals: Rental[];
}> {
  const supabase = await createClient();
  const [eqRes, rtRes] = await Promise.all([
    supabase.from("dl_equipment").select("*").order("created_at", { ascending: true }),
    supabase.from("dl_rentals").select("*"),
  ]);

  const equipment = (eqRes.data ?? []) as Equipment[];
  const rentals = ((rtRes.data ?? []) as RawRental[]).map(toRental);
  return { equipment, rentals };
}
