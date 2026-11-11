import { createClient } from "@/lib/supabase/server";
import { ManuseioClient, type LocacaoOpcao } from "./ManuseioClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manuseio do laser — Lux Derma",
};

/** Data de hoje em São Paulo deslocada em `dias`, no formato AAAA-MM-DD. */
function diaSP(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

export default async function ManuseioPage() {
  // Locações de ontem a amanhã: instala-se na véspera ou no dia e
  // desinstala-se no dia ou no seguinte. Servem só para identificar no
  // checklist enviado de qual locação se trata.
  const supabase = await createClient();
  const [{ data: rentals }, { data: equipment }] = await Promise.all([
    supabase
      .from("rentals")
      .select("id, client, address, date, start_time, equip_id")
      .gte("date", diaSP(-1))
      .lte("date", diaSP(1))
      .order("date")
      .order("start_time"),
    supabase.from("equipment").select("id, name"),
  ]);
  const nomeEquip = new Map((equipment ?? []).map((e) => [e.id, e.name as string]));
  const locacoes: LocacaoOpcao[] = (rentals ?? []).map((r) => ({
    id: r.id,
    cliente: r.client,
    endereco: r.address,
    data: r.date,
    equipamento: r.equip_id ? (nomeEquip.get(r.equip_id) ?? null) : null,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-ink tracking-tight">
          Manuseio do laser
        </h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">
          Roteiros para instalar e desinstalar o SmartXide Punto na clínica.
          Toque em cada passo ao concluir: o progresso fica salvo neste
          aparelho até você recomeçar. No fim, envie o checklist pelo WhatsApp.
        </p>
      </div>
      <ManuseioClient locacoes={locacoes} hoje={diaSP(0)} />
    </div>
  );
}
