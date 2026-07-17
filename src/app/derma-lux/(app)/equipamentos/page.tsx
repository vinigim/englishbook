import { getDermaLuxData } from "../../data";
import { EquipamentosClient } from "../EquipamentosClient";

export const dynamic = "force-dynamic";

export default async function DermaLuxEquipamentosPage() {
  const { equipment, rentals } = await getDermaLuxData();
  return <EquipamentosClient equipment={equipment} rentals={rentals} />;
}
