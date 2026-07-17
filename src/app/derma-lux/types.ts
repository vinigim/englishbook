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
  notes: string | null;
};
