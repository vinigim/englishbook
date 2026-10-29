import Link from "next/link";
import { Alert } from "@/components/ui/Badge";
import {
  countLeads,
  countPendingAnalysis,
  getAnalysisSpend,
  getLeadsInbox,
  INBOX_LIMIT,
} from "../../leads-data";
import { colunaExtraDoInstagram, truncate } from "../../leads-shared";
import type { LeadInboxRow } from "../../leads-types";
import { InboxActions } from "./InboxActions";
import { InboxClient } from "./InboxClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Radar de Leads — Lux Derma",
};

/**
 * O que a lista do radar realmente usa, e nada mais.
 *
 * Tudo o que esta página passa ao InboxClient vai inteiro para o navegador. Com
 * ~950 leads, isso eram megabytes de rascunhos, resumos e justificativas da IA,
 * mensagens inteiras e todas as colunas extras da planilha — nenhum deles
 * mostrado na lista, e todos baixados e lidos pelo celular a cada visita.
 *
 * Fica de fora só o que a lista não lê:
 *   - os textos longos da análise (a ficha os busca por conta própria);
 *   - a mensagem além do que cabe na prévia de 140 caracteres;
 *   - as colunas extras, menos a do Instagram — `instagramDoLead` continua
 *     achando o mesmo @, então busca, chips e selos não mudam.
 *
 * A prioridade já foi calculada no servidor com a análise completa.
 */
function paraALista(rows: LeadInboxRow[]): LeadInboxRow[] {
  return rows.map((row) => {
    const extraIg = colunaExtraDoInstagram(row.lead.extra);
    return {
      ...row,
      lead: { ...row.lead, extra: extraIg ? { [extraIg[0]]: extraIg[1] } : {} },
      analysis: row.analysis
        ? {
            ...row.analysis,
            summary: null,
            intent: null,
            draft_message: null,
            rationale: null,
          }
        : null,
      lastMessage: row.lastMessage
        ? {
            ...row.lastMessage,
            body: row.lastMessage.body ? truncate(row.lastMessage.body, 200) : null,
          }
        : null,
    };
  });
}

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
            {spend.instagram.count > 0
              ? ` · US$ ${spend.instagram.total.toFixed(2)} em ${spend.instagram.count} buscas de Instagram`
              : ""}
          </p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2">
          <div className="flex flex-wrap gap-4">
            <Link
              href="/derma-lux/leads/janelas"
              className="text-sm font-medium text-ink hover:text-accent underline transition-colors"
            >
              Janelas da rota
            </Link>
            <Link
              href="/derma-lux/leads/importar"
              className="text-sm text-muted hover:text-ink underline transition-colors"
            >
              Importar planilha
            </Link>
            {/* <a> e não <Link>: é um download, não uma navegação. */}
            <a
              href="/api/leads/exportar"
              className="text-sm text-muted hover:text-ink underline transition-colors"
            >
              Exportar planilha
            </a>
            <Link
              href="/derma-lux/leads/nao-identificadas"
              className="text-sm text-muted hover:text-ink underline transition-colors"
            >
              Conversas não identificadas
            </Link>
          </div>
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
              Mostrando {rows.length} de {total} leads: a tela carrega no
              máximo {INBOX_LIMIT}, para não ficar pesada. Os filtros e a busca
              só alcançam esses. Chegou a hora de levar a busca e os filtros
              para o banco — me avise.
            </Alert>
          ) : null}
          <InboxClient rows={paraALista(rows)} />
        </>
      )}
    </div>
  );
}
