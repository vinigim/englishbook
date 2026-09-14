import { getDermaLuxData } from "../../data";
import { AvailabilityClient } from "../AvailabilityClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Disponibilidade Clínica — Lux Derma",
};

export default async function DermaLuxClinicaPage() {
  const { equipment, rentals, blocks } = await getDermaLuxData();
  return (
    <AvailabilityClient
      equipment={equipment}
      rentals={rentals}
      blocks={blocks}
      mode="clinica"
    />
  );
}
