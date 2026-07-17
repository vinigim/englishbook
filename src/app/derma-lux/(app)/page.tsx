import { getDermaLuxData } from "../data";
import { AgendaClient } from "./AgendaClient";

export const dynamic = "force-dynamic";

export default async function DermaLuxAgendaPage() {
  const { equipment, rentals } = await getDermaLuxData();
  return <AgendaClient equipment={equipment} rentals={rentals} />;
}
