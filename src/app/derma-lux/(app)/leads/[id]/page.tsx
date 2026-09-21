import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadDetail } from "../../../leads-data";
import { leadDisplayName } from "../../../leads-shared";
import { LeadDetailClient } from "./LeadDetailClient";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getLeadDetail(id);
  if (!detail) notFound();

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/derma-lux/leads"
          className="text-sm text-muted hover:text-ink transition-colors"
        >
          ← Voltar ao radar
        </Link>
        <h1 className="font-display text-3xl text-ink tracking-tight mt-2">
          {leadDisplayName(detail.lead)}
        </h1>
      </div>

      <LeadDetailClient detail={detail} />
    </div>
  );
}
