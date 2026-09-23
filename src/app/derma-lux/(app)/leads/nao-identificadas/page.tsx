import { createClient } from "@/lib/supabase/server";
import { formatPhoneBR } from "../../../leads-shared";
import { VoltarAoRadar } from "../VoltarAoRadar";
import {
  NaoIdentificadasClient,
  type LeadOpcao,
  type VinculoFeito,
} from "./NaoIdentificadasClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Conversas não identificadas — Radar de Leads",
};

export default async function NaoIdentificadasPage() {
  const supabase = await createClient();
  // Só o necessário para achar o lead pelo nome, clínica, cidade ou telefone.
  const { data } = await supabase
    .from("wa_leads")
    .select("id, display_name, sheet_name, clinic_name, city, phone_e164")
    .eq("archived", false)
    .order("sheet_name", { ascending: true })
    .limit(2000);

  const leads: LeadOpcao[] = (
    (data ?? []) as {
      id: string;
      display_name: string | null;
      sheet_name: string | null;
      clinic_name: string | null;
      city: string | null;
      phone_e164: string | null;
    }[]
  ).map((l) => {
    const telefone = l.phone_e164 ? formatPhoneBR(l.phone_e164) : "";
    return {
      id: l.id,
      nome: l.display_name || l.sheet_name || l.clinic_name || telefone,
      detalhe: [l.city, telefone].filter(Boolean).join(" · "),
      busca: [l.display_name, l.sheet_name, l.clinic_name, l.city, l.phone_e164]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });

  // Vínculos já feitos, para dar para desfazer um feito no lead errado. Tabela
  // ausente (migração 0017 não rodada) só deixa a lista vazia.
  const { data: links } = await supabase
    .from("wa_lid_links")
    .select("lid, created_at, lead_id")
    .order("created_at", { ascending: false });

  const porId = new Map(leads.map((l) => [l.id, l]));
  const vinculos: VinculoFeito[] = (
    (links ?? []) as { lid: string; created_at: string; lead_id: string | null }[]
  ).map((v) => {
    const lead = v.lead_id ? porId.get(v.lead_id) : undefined;
    return {
      lid: v.lid,
      criadoEm: v.created_at,
      leadId: v.lead_id,
      leadNome: lead?.nome ?? "Lead removido",
      leadDetalhe: lead?.detalhe ?? "",
    };
  });

  return (
    <div>
      <div className="mb-6">
        <VoltarAoRadar />
        <h1 className="font-display text-3xl text-ink tracking-tight mt-2">
          Conversas não identificadas
        </h1>
        <p className="text-muted text-sm mt-1">
          Conversas que estão no seu WhatsApp, mas chegaram sem telefone — o
          WhatsApp mandou só um código interno do contato. Diga a qual lead cada
          uma pertence e ela passa a aparecer na tela dele. Basta fazer uma vez
          por contato.
        </p>
      </div>

      <NaoIdentificadasClient leads={leads} vinculos={vinculos} />
    </div>
  );
}
