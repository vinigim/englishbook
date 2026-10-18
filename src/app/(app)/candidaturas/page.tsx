import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { RESULTADO_LABEL, STATUS, STATUS_LABEL, type Resultado, type Status } from "@/lib/tipos";
import { dataCurta, diasDesde, hojeSP } from "@/lib/utils";
import { MoverStatus } from "./mover-status";

export const dynamic = "force-dynamic";

type Linha = {
  id: string;
  status: Status;
  resultado: Resultado | null;
  aplicada_em: string | null;
  proximo_followup: string | null;
  updated_at: string;
  vagas: { id: string; titulo: string; empresa: string; nota: number | null } | null;
};

export default async function CandidaturasPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidaturas")
    .select("id, status, resultado, aplicada_em, proximo_followup, updated_at, vagas(id, titulo, empresa, nota)")
    .order("updated_at", { ascending: false });
  const linhas = (data ?? []) as unknown as Linha[];
  const hoje = hojeSP();

  const aplicadas = linhas.filter((l) => l.aplicada_em).length;
  const chegaramEmEntrevista = linhas.filter(
    (l) => l.status === "entrevista" || l.status === "proposta" || l.resultado === "contratado" || l.resultado === "reprovado",
  ).length;
  const followupsVencidos = linhas.filter((l) => l.proximo_followup && l.proximo_followup <= hoje && l.status !== "encerrado");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Candidaturas</h1>
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero rotulo="No funil" valor={linhas.filter((l) => l.status !== "encerrado").length} />
        <Numero rotulo="Candidaturas enviadas" valor={aplicadas} />
        <Numero rotulo="Taxa de entrevista" valor={aplicadas ? `${Math.round((chegaramEmEntrevista / aplicadas) * 100)}%` : "—"} />
        <Numero rotulo="Follow-ups para hoje" valor={followupsVencidos.length} destaque={followupsVencidos.length > 0} />
      </div>

      {linhas.length === 0 && (
        <Card className="text-sm text-slate-500">
          Nenhuma candidatura ainda. Abra uma vaga e clique em “Já me candidatei” ou “Tenho interesse”.
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {STATUS.map((s) => {
          const coluna = linhas.filter((l) => l.status === s);
          return (
            <div key={s} className="rounded-lg bg-slate-100 p-2">
              <p className="mb-2 px-1 text-sm font-semibold text-slate-700">
                {STATUS_LABEL[s]} <span className="font-normal text-slate-400">({coluna.length})</span>
              </p>
              <div className="space-y-2">
                {coluna.map((l) => {
                  const dias = diasDesde(l.aplicada_em ? `${l.aplicada_em}T12:00:00Z` : null);
                  const vencido = l.proximo_followup && l.proximo_followup <= hoje && s !== "encerrado";
                  return (
                    <Card key={l.id} className="space-y-1 p-3">
                      <Link href={`/vagas/${l.vagas?.id}`} className="block text-sm font-medium hover:text-indigo-700">
                        {l.vagas?.titulo}
                      </Link>
                      <p className="text-xs text-slate-500">{l.vagas?.empresa}</p>
                      <div className="flex flex-wrap gap-1">
                        {dias != null && <Badge>aplicada há {dias}d</Badge>}
                        {l.proximo_followup && s !== "encerrado" && (
                          <Badge cor={vencido ? "vermelho" : "cinza"}>follow-up {dataCurta(l.proximo_followup)}</Badge>
                        )}
                        {l.resultado && <Badge cor={l.resultado === "contratado" ? "verde" : "cinza"}>{RESULTADO_LABEL[l.resultado]}</Badge>}
                      </div>
                      <MoverStatus id={l.id} status={l.status} />
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: number | string; destaque?: boolean }) {
  return (
    <Card className={destaque ? "border-red-200 bg-red-50" : ""}>
      <p className="text-xs text-slate-500">{rotulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
    </Card>
  );
}
