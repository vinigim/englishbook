import { notFound } from "next/navigation";
import { getDraftTokenProfile, getLeadDetail } from "../../../leads-data";
import { leadDisplayName } from "../../../leads-shared";
import { LeadDetailClient } from "./LeadDetailClient";
import { VoltarAoRadar } from "../VoltarAoRadar";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Em paralelo: o perfil de tokens não depende do lead, e serve só para o
  // seletor de modelo mostrar preço em dólares em vez de em dólares por
  // milhão de tokens.
  const [detail, tokenProfile] = await Promise.all([
    getLeadDetail(id),
    getDraftTokenProfile(),
  ]);
  if (!detail) notFound();

  return (
    <div>
      <div className="mb-5">
        <VoltarAoRadar />
        <h1 className="font-display text-3xl text-ink tracking-tight mt-2">
          {leadDisplayName(detail.lead)}
        </h1>
      </div>

      <LeadDetailClient detail={detail} tokenProfile={tokenProfile} />
    </div>
  );
}
