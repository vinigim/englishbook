export type Equipment = {
  id: string;
  name: string;
  use: string | null;
  color: string;
};

export type Rental = {
  id: string;
  client: string;
  address: string;
  phone: string | null;
  equip_id: string | null;
  date: string; // yyyy-mm-dd
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  price: number | null;
  freight_price: number | null;
  technique_price: number | null;
  notes: string | null;
  specialty: string | null;
  tips_used: string | null;
  sterilized: boolean | null;
  specialized_technique: boolean | null;
};

export type BlockPeriod = "full" | "morning" | "afternoon";

// 'patient' = fechado com paciente (indisponível na Clínica e na Locação)
// 'locacao' = fechado para locação (indisponível só na Locação)
export type BlockReason = "patient" | "locacao";

export type Block = {
  id: string;
  equip_id: string | null;
  date: string; // yyyy-mm-dd
  period: BlockPeriod;
  reason: BlockReason;
  note: string | null;
};
