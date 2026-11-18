import { createClient } from "@/lib/supabase/server";
import { VoltarAoRadar } from "../VoltarAoRadar";
import { TesteBuscaClient, type LeadTeste } from "./TesteBuscaClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Teste da busca de Instagram — Radar de Leads",
};

/**
 * Teste A/B da busca de Instagram na ficha (Sonnet): ferramentas básicas
 * contra as de filtragem dinâmica, nos mesmos leads. Temporária — sai depois
 * da decisão. Os leads já foram buscados pela ficha; o @ salvo é o gabarito:
 *  - 5 que a IA achou e o dono confirmou;
 *  - 3 que a IA não achou e o dono achou na mão;
 *  - 2 que ninguém achou.
 */
const LEADS: { id: string; grupo: LeadTeste["grupo"] }[] = [
  { id: "c3abcc26-9d30-4c57-9c4c-938de223a55f", grupo: "IA achou" },
  { id: "aa7c53d8-9b93-49cb-a921-f5346f274be2", grupo: "IA achou" },
  { id: "86580455-5fbb-4291-b941-4061c224e280", grupo: "IA achou" },
  { id: "7c1fad97-0649-49dd-aeb1-5c46fcd0fa10", grupo: "IA achou" },
  { id: "4ab4ad31-f0ef-4aa4-baf7-4cf426d04c02", grupo: "IA achou" },
  { id: "84a26824-79ea-4905-b736-10684c391656", grupo: "Dono achou" },
  { id: "13f06a11-1720-4aeb-b200-fe325c30647c", grupo: "Dono achou" },
  { id: "6d7332c5-4020-49a6-b841-ac03c4d7da1b", grupo: "Dono achou" },
  { id: "a88ac3b5-4ecc-43d2-9914-fc187b60219b", grupo: "Ninguém achou" },
  { id: "3b1a5a95-d009-494c-ac85-35ce11ef3250", grupo: "Ninguém achou" },
];

export default async function TesteBuscaPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wa_leads")
    .select("id, sheet_name, display_name, instagram")
    .in("id", LEADS.map((l) => l.id));

  const porId = new Map(
    ((data ?? []) as { id: string; sheet_name: string | null; display_name: string | null; instagram: string | null }[]).map(
      (l) => [l.id, l],
    ),
  );
  const leads: LeadTeste[] = LEADS.flatMap(({ id, grupo }) => {
    const l = porId.get(id);
    return l
      ? [{ id, grupo, nome: l.sheet_name || l.display_name || id, gabarito: l.instagram }]
      : [];
  });

  return (
    <div className="space-y-4">
      <VoltarAoRadar />
      <h1 className="font-serif text-3xl">Teste da busca de Instagram</h1>
      <p className="text-sm text-muted max-w-2xl">
        Cada lead é buscado duas vezes no Sonnet: com as ferramentas de hoje e com as
        novas (filtragem dinâmica). Nada é salvo no lead; o gasto entra no painel
        marcado como teste. São 20 buscas, cerca de US$ 4, e leva uns 15 minutos.
        Deixe a página aberta até terminar.
      </p>
      <TesteBuscaClient leads={leads} />
    </div>
  );
}
