import { Alert } from "@/components/ui/Badge";
import { getDermaLuxData } from "../../../data";
import { calcularJanelas, DESCONTO_JANELA, HORIZONTE_DIAS, RAIO_KM } from "../../../janelas";
import { getLeadsInbox } from "../../../leads-data";
import { VoltarAoRadar } from "../VoltarAoRadar";
import { JanelasClient } from "./JanelasClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Janelas da rota — Lux Derma",
};

/** yyyy-mm-dd em São Paulo, e não no fuso do servidor (UTC na Vercel). */
function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
}

export default async function JanelasPage() {
  const [{ equipment, rentals, blocks }, rows] = await Promise.all([
    getDermaLuxData(),
    getLeadsInbox(),
  ]);

  const resultado = calcularJanelas({ equipment, rentals, blocks, rows, hoje: hojeSaoPaulo() });

  return (
    <div>
      <VoltarAoRadar />
      <div className="mb-6">
        <h1 className="font-display text-3xl text-ink tracking-tight">Janelas da rota</h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">
          Dias livres colados a uma locação dos próximos {HORIZONTE_DIAS} dias. O laser já vai
          estar na região, então quem está a até {RAIO_KM} km (em linha reta) recebe a data com{" "}
          {Math.round(DESCONTO_JANELA * 100)}% de desconto na locação.
        </p>
      </div>

      {rows.length === 0 ? (
        <Alert variant="info" className="mb-4">
          O Radar não devolveu nenhum lead. Sem leads (ou sem acesso a eles), não há a quem
          oferecer as janelas.
        </Alert>
      ) : null}

      <JanelasClient resultado={resultado} />
    </div>
  );
}
