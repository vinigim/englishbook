"use client";

import { useState, useTransition } from "react";
import { salvarPerfil } from "@/app/actions";
import { Alerta, Button, Card } from "@/components/ui";
import { ATS, type Ats, type EmpresaAlvo } from "@/lib/tipos";

type Perfil = {
  nome: string | null;
  resumo_profissional: string;
  termos_busca: string[];
  aceita_remoto: boolean;
  aceita_hibrido: boolean;
  aceita_presencial: boolean;
  aceita_internacional: boolean;
  cidades: string[];
  empresas_alvo: EmpresaAlvo[];
  busca_ativa: boolean;
};

const DICA_SLUG: Record<Ats, string> = {
  greenhouse: "boards.greenhouse.io/<slug>",
  lever: "jobs.lever.co/<slug>",
  smartrecruiters: "jobs.smartrecruiters.com/<slug>",
  workable: "apply.workable.com/<slug>",
  workday: "empresa.wd5.myworkdayjobs.com/Site",
};

const lista = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function FormPerfil({ perfil }: { perfil: Perfil }) {
  const [f, setF] = useState({
    ...perfil,
    nome: perfil.nome ?? "",
    termos: perfil.termos_busca.join(", "),
    cidadesTexto: perfil.cidades.join(", "),
  });
  const [empresas, setEmpresas] = useState<EmpresaAlvo[]>(perfil.empresas_alvo ?? []);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const check = (k: "aceita_remoto" | "aceita_hibrido" | "aceita_presencial" | "aceita_internacional" | "busca_ativa", rotulo: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />
      {rotulo}
    </label>
  );

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <label className="label">Nome</label>
          <input className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </div>
        <div>
          <label className="label">O que você procura (a IA usa isto e o seu CV para dar a nota de cada vaga)</label>
          <textarea
            className="input h-28"
            placeholder="Ex.: 15 anos em COBOL/CICS/DB2 em bancos, 4 liderando squads. Busco Tech Lead ou Coordenação, remoto, a partir de R$ 18 mil. Interesse em modernização de mainframe."
            value={f.resumo_profissional}
            onChange={(e) => setF({ ...f, resumo_profissional: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Termos buscados na Gupy e nas empresas-alvo (separados por vírgula)</label>
          <input className="input" value={f.termos} onChange={(e) => setF({ ...f, termos: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-4">
          {check("aceita_remoto", "Remoto")}
          {check("aceita_hibrido", "Híbrido")}
          {check("aceita_presencial", "Presencial")}
          {check("aceita_internacional", "Internacional")}
        </div>
        <div>
          <label className="label">Cidades para híbrido/presencial (separadas por vírgula)</label>
          <input className="input" placeholder="São Paulo, Campinas" value={f.cidadesTexto} onChange={(e) => setF({ ...f, cidadesTexto: e.target.value })} />
        </div>
        {check("busca_ativa", "Busca diária automática ligada")}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Empresas-alvo</h2>
            <p className="text-xs text-slate-500">Páginas de carreira com API pública. O “slug” está na URL da página de vagas da empresa.</p>
          </div>
          <Button variante="secundario" onClick={() => setEmpresas([...empresas, { nome: "", ats: "greenhouse", slug: "" }])}>+ Empresa</Button>
        </div>
        {empresas.map((e, i) => {
          const mudar = (x: Partial<EmpresaAlvo>) => setEmpresas(empresas.map((y, j) => (j === i ? { ...y, ...x } : y)));
          return (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_150px_1.5fr_auto]">
              <input className="input" placeholder="Nome" value={e.nome} onChange={(x) => mudar({ nome: x.target.value })} />
              <select className="input" value={e.ats} onChange={(x) => mudar({ ats: x.target.value as Ats })}>
                {ATS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <input className="input" placeholder={DICA_SLUG[e.ats]} value={e.slug} onChange={(x) => mudar({ slug: x.target.value })} />
              <Button variante="fantasma" onClick={() => setEmpresas(empresas.filter((_, j) => j !== i))}>✕</Button>
            </div>
          );
        })}
      </Card>

      {msg && <Alerta tipo={msg.ok ? "ok" : "erro"}>{msg.texto}</Alerta>}
      <Button
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await salvarPerfil({
              nome: f.nome,
              resumo_profissional: f.resumo_profissional,
              termos_busca: lista(f.termos),
              aceita_remoto: f.aceita_remoto,
              aceita_hibrido: f.aceita_hibrido,
              aceita_presencial: f.aceita_presencial,
              aceita_internacional: f.aceita_internacional,
              cidades: lista(f.cidadesTexto),
              empresas_alvo: empresas.filter((e) => e.nome.trim() && e.slug.trim()),
              busca_ativa: f.busca_ativa,
            });
            setMsg(r.ok ? { ok: true, texto: "Perfil salvo." } : { ok: false, texto: r.error ?? "Erro" });
          })
        }
      >
        {pendente ? "Salvando…" : "Salvar perfil"}
      </Button>
    </div>
  );
}
