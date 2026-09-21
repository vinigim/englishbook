import Link from "next/link";
import { Alert } from "@/components/ui/Badge";
import {
  countLeads,
  countPendingAnalysis,
  getAnalysisSpend,
  getLeadsInbox,
} from "../../leads-data";
import { InboxActions } from "./InboxActions";
import { InboxClient } from "./InboxClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Radar de Leads — Lux Derma",
};

export default async function LeadsPage() {
  const [rows, total, pending, spend] = await Promise.all([
    getLeadsInbox(),
    countLeads(),
    countPendingAnalysis(),
    getAnalysisSpend(),
  ]);

  // Os filtros e a busca rodam sobre `rows`, então um lead não carregado é um
  // lead que não dá para achar. Se isso acontecer, é melhor dizer.
  const truncado = total > rows.length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl text-ink tracking-tight">
            Radar de Leads
          </h1>
          <p className="text-muted text-sm mt-1">
            {total === 0
              ? "Nenhum lead ainda."
              : `${total} ${total === 1 ? "lead" : "leads"} · ${pending} aguardando análise`}
            {spend.count > 0
              ? ` · US$ ${spend.total.toFixed(2)} gastos em ${spend.count} análises`
              : ""}
          </p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2">
          <Link
            href="/derma-lux/leads/importar"
            className="text-sm text-muted hover:text-ink underline transition-colors"
          >
            Importar planilha
          </Link>
          <InboxActions pendentes={pending} />
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
        <>
          {truncado ? (
            <Alert variant="warning" className="mb-4">
              Mostrando os {rows.length} leads mais recentes, de {total}. Os
              filtros e a busca só alcançam esses — se precisar chegar nos
              outros, me avise que eu acrescento paginação.
            </Alert>
          ) : null}
          <InboxClient rows={rows} />
        </>
      )}
    </div>
  );
}
