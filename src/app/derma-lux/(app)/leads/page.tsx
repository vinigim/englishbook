import Link from "next/link";
import { Alert } from "@/components/ui/Badge";
import {
  countPendingAnalysis,
  getAnalysisSpend,
  getLeadsInbox,
} from "../../leads-data";
import { InboxClient } from "./InboxClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Radar de Leads — Lux Derma",
};

export default async function LeadsPage() {
  const [rows, pending, spend] = await Promise.all([
    getLeadsInbox(),
    countPendingAnalysis(),
    getAnalysisSpend(),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl text-ink tracking-tight">
            Radar de Leads
          </h1>
          <p className="text-muted text-sm mt-1">
            {rows.length === 0
              ? "Nenhum lead ainda."
              : `${rows.length} ${rows.length === 1 ? "lead" : "leads"} · ${pending} aguardando análise`}
            {spend.count > 0
              ? ` · US$ ${spend.total.toFixed(2)} gastos em ${spend.count} análises`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/derma-lux/leads/importar"
            className="px-4 py-2 text-sm font-medium border border-ink text-ink hover:bg-ink hover:text-paper transition-colors"
          >
            Importar planilha
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <Alert variant="info" title="O radar ainda está vazio">
          <p className="mb-2">
            Duas formas de povoar esta tela, nesta ordem:
          </p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              <Link
                href="/derma-lux/leads/importar"
                className="underline font-medium"
              >
                Importar a planilha
              </Link>{" "}
              de clientes — funciona sem depender do WhatsApp.
            </li>
            <li>
              Conectar o WhatsApp da empresa e sincronizar o histórico das
              conversas.
            </li>
          </ol>
        </Alert>
      ) : (
        <InboxClient rows={rows} />
      )}
    </div>
  );
}
