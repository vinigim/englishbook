import { getDermaLuxData } from "../../data";
import { AvailabilityClient } from "../AvailabilityClient";

export const dynamic = "force-dynamic";

export default async function DermaLuxAvailabilityPage() {
  const { equipment, rentals } = await getDermaLuxData();
  return <AvailabilityClient equipment={equipment} rentals={rentals} />;
}
