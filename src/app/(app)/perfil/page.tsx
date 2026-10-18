import { Card } from "@/components/ui";
import { gmailConfigurado } from "@/lib/fontes/gmail";
import { createClient } from "@/lib/supabase/server";
import { dataHora } from "@/lib/utils";
import { FormPerfil } from "./form-perfil";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const supabase = await createClient();
  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);

  const [{ data: perfil }, { data: uso }, { data: execucoes }] = await Promise.all([
    supabase.from("perfil").select("*").maybeSingle(),
    supabase.from("uso_ia").select("tarefa, cost_usd").gte("created_at", inicioMes.toISOString()),
    supabase.from("execucoes_busca").select("id, origem, iniciada_em, terminada_em, resumo").order("iniciada_em", { ascending: false }).limit(10),
  ]);

  const porTarefa = new Map<string, number>();
  for (const u of uso ?? []) porTarefa.set(u.tarefa, (porTarefa.get(u.tarefa) ?? 0) + Number(u.cost_usd));
  const total = [...porTarefa.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Perfil e fontes de vagas</h1>
        {perfil && <FormPerfil perfil={perfil} />}
      </div>
      <div className="space-y-4">
        <Card>
          <h2 className="mb-2 font-semibold">Alertas do Gmail</h2>
          <p className="text-sm">
            {gmailConfigurado()
              ? <span className="text-emerald-700">✓ Conectado ({process.env.GMAIL_USER})</span>
              : <span className="text-amber-700">Não configurado — veja o README (GMAIL_USER e GMAIL_APP_PASSWORD).</span>}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Crie alertas diários no LinkedIn, Indeed, Glassdoor e Catho com termos como “mainframe”, “COBOL”,
            “CICS”, “z/OS” e “alta plataforma”. O radar lê esses e-mails toda manhã.
          </p>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Custo de IA no mês</h2>
          <p className="text-2xl font-semibold">US$ {total.toFixed(2)}</p>
          <ul className="mt-1 text-xs text-slate-500">
            {[...porTarefa.entries()].map(([t, c]) => <li key={t}>{t}: US$ {c.toFixed(3)}</li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Últimas buscas</h2>
          <ul className="space-y-2 text-xs">
            {execucoes?.map((e) => (
              <li key={e.id}>
                <p className="font-medium">{dataHora(e.iniciada_em)} · {e.origem}{!e.terminada_em && " · não terminou"}</p>
                {e.resumo?.triadas != null && (
                  <p className="text-slate-500">{e.resumo.triadas} triadas, {e.resumo.relevantes} relevantes, {e.resumo.pendentes} pendentes</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
