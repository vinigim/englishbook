"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { salvarCv } from "@/app/actions";
import { Alerta, Button, Card } from "@/components/ui";
import type { Cv, Experiencia } from "@/lib/tipos";

const EXPERIENCIA_VAZIA: Experiencia = {
  cargo: "", empresa: "", local: "", inicio: "", fim: "", resumo: "", realizacoes: [], tecnologias: [],
};

const linhas = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const virgulas = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function EditorCv({ id, inicial }: { id: string | null; inicial: Cv }) {
  const router = useRouter();
  const [cv, setCv] = useState<Cv>(inicial);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [importando, setImportando] = useState(false);
  const [textoColado, setTextoColado] = useState("");

  const set = <K extends keyof Cv>(k: K, v: Cv[K]) => setCv({ ...cv, [k]: v });
  const setExp = (i: number, e: Partial<Experiencia>) =>
    set("experiencias", cv.experiencias.map((x, j) => (j === i ? { ...x, ...e } : x)));

  async function importar(dados: FormData) {
    setImportando(true);
    setMsg({ tipo: "info", texto: "Lendo o CV com IA… (até 1 min)" });
    const res = await fetch("/api/cv/importar", { method: "POST", body: dados });
    setImportando(false);
    const r = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg({ tipo: "erro", texto: r.mensagem ?? `Não foi possível importar (${r.error ?? res.status}).` });
    setCv(r.cv);
    setMsg({ tipo: "info", texto: "CV importado. Confira os campos e clique em Salvar." });
  }

  function salvar() {
    iniciar(async () => {
      const r = await salvarCv(id, cv);
      setMsg(r.ok ? { tipo: "ok", texto: "CV salvo." } : { tipo: "erro", texto: r.error ?? "Erro ao salvar" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <h2 className="font-semibold">Importar um CV existente</h2>
        <p className="text-sm text-slate-500">Envie o PDF ou cole o texto; a IA preenche os campos abaixo para você revisar.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            📄 Enviar PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={importando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const d = new FormData();
                d.append("arquivo", f);
                importar(d);
                e.target.value = "";
              }}
            />
          </label>
          <span className="text-xs text-slate-400">ou</span>
        </div>
        <textarea className="input h-24" placeholder="Cole aqui o texto do seu CV" value={textoColado} onChange={(e) => setTextoColado(e.target.value)} />
        <Button
          variante="secundario"
          disabled={importando || textoColado.trim().length < 100}
          onClick={() => { const d = new FormData(); d.append("texto", textoColado); importar(d); }}
        >
          Importar texto
        </Button>
      </Card>

      {msg && <Alerta tipo={msg.tipo}>{msg.texto}</Alerta>}

      <Card className="space-y-3">
        <h2 className="font-semibold">Dados pessoais</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo rotulo="Nome" valor={cv.nome} onChange={(v) => set("nome", v)} />
          <Campo rotulo="Título profissional" valor={cv.titulo} onChange={(v) => set("titulo", v)} placeholder="Especialista Mainframe | COBOL · CICS · DB2" />
          <Campo rotulo="E-mail" valor={cv.contato.email} onChange={(v) => set("contato", { ...cv.contato, email: v })} />
          <Campo rotulo="Telefone" valor={cv.contato.telefone} onChange={(v) => set("contato", { ...cv.contato, telefone: v })} />
          <Campo rotulo="Cidade" valor={cv.contato.cidade} onChange={(v) => set("contato", { ...cv.contato, cidade: v })} />
          <Campo rotulo="LinkedIn" valor={cv.contato.linkedin} onChange={(v) => set("contato", { ...cv.contato, linkedin: v })} />
        </div>
        <div>
          <label className="label">Resumo profissional</label>
          <textarea className="input h-28" value={cv.resumo} onChange={(e) => set("resumo", e.target.value)} />
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Experiência</h2>
          <Button variante="secundario" onClick={() => set("experiencias", [EXPERIENCIA_VAZIA, ...cv.experiencias])}>+ Experiência</Button>
        </div>
        {cv.experiencias.map((e, i) => (
          <div key={i} className="space-y-2 rounded-md border border-slate-200 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Campo rotulo="Cargo" valor={e.cargo} onChange={(v) => setExp(i, { cargo: v })} />
              <Campo rotulo="Empresa" valor={e.empresa} onChange={(v) => setExp(i, { empresa: v })} />
              <Campo rotulo="Local" valor={e.local} onChange={(v) => setExp(i, { local: v })} />
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="Início" valor={e.inicio} onChange={(v) => setExp(i, { inicio: v })} placeholder="03/2019" />
                <Campo rotulo="Fim" valor={e.fim} onChange={(v) => setExp(i, { fim: v })} placeholder="Atual" />
              </div>
            </div>
            <div>
              <label className="label">Resumo da função</label>
              <textarea className="input h-16" value={e.resumo} onChange={(x) => setExp(i, { resumo: x.target.value })} />
            </div>
            <div>
              <label className="label">Realizações (uma por linha — use números sempre que puder)</label>
              <TextoLista valor={e.realizacoes} separar={linhas} juntar={"\n"} onChange={(v) => setExp(i, { realizacoes: v })} className="h-24" />
            </div>
            <div>
              <label className="label">Tecnologias (separadas por vírgula)</label>
              <TextoLista valor={e.tecnologias} separar={virgulas} juntar=", " onChange={(v) => setExp(i, { tecnologias: v })} />
            </div>
            <div className="flex gap-2">
              <Button variante="fantasma" disabled={i === 0} onClick={() => {
                const l = [...cv.experiencias]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; set("experiencias", l);
              }}>↑</Button>
              <Button variante="fantasma" disabled={i === cv.experiencias.length - 1} onClick={() => {
                const l = [...cv.experiencias]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; set("experiencias", l);
              }}>↓</Button>
              <Button variante="fantasma" className="ml-auto text-red-600" onClick={() => set("experiencias", cv.experiencias.filter((_, j) => j !== i))}>
                Remover
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Habilidades</h2>
        <p className="text-xs text-slate-500">Uma linha por grupo, no formato <code>Grupo: item, item, item</code></p>
        <TextoLista
          className="h-28"
          valor={cv.habilidades.map((h) => `${h.grupo}: ${h.itens.join(", ")}`)}
          separar={linhas}
          juntar={"\n"}
          onChange={(v) =>
            set("habilidades", v.map((l) => {
              const [grupo, ...resto] = l.split(":");
              return resto.length ? { grupo: grupo.trim(), itens: virgulas(resto.join(":")) } : { grupo: "Geral", itens: virgulas(grupo) };
            }))
          }
        />
        <h2 className="font-semibold">Formação</h2>
        <p className="text-xs text-slate-500">Uma por linha: <code>Curso | Instituição | Conclusão</code></p>
        <TextoLista
          className="h-20"
          valor={cv.formacao.map((f) => [f.curso, f.instituicao, f.conclusao].join(" | "))}
          separar={linhas}
          juntar={"\n"}
          onChange={(v) => set("formacao", v.map((l) => {
            const [curso = "", instituicao = "", conclusao = ""] = l.split("|").map((x) => x.trim());
            return { curso, instituicao, conclusao };
          }))}
        />
        <h2 className="font-semibold">Certificações</h2>
        <TextoLista className="h-20" valor={cv.certificacoes} separar={linhas} juntar={"\n"} onChange={(v) => set("certificacoes", v)} />
        <h2 className="font-semibold">Idiomas</h2>
        <p className="text-xs text-slate-500">Uma por linha: <code>Inglês: avançado</code></p>
        <TextoLista
          className="h-16"
          valor={cv.idiomas.map((i) => `${i.idioma}: ${i.nivel}`)}
          separar={linhas}
          juntar={"\n"}
          onChange={(v) => set("idiomas", v.map((l) => {
            const [idioma, nivel = ""] = l.split(":").map((x) => x.trim());
            return { idioma, nivel };
          }))}
        />
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={salvar} disabled={pendente} className="shadow-lg">{pendente ? "Salvando…" : "💾 Salvar CV"}</Button>
      </div>
    </div>
  );
}

function Campo({ rotulo, valor, onChange, placeholder }: { rotulo: string; valor: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="label">{rotulo}</label>
      <input className="input" value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Textarea que edita uma lista; guarda o texto cru para não "comer" o que está sendo digitado. */
function TextoLista({
  valor, separar, juntar, onChange, className,
}: { valor: string[]; separar: (s: string) => string[]; juntar: string; onChange: (v: string[]) => void; className?: string }) {
  const [texto, setTexto] = useState(valor.join(juntar));
  const [ultimo, setUltimo] = useState(valor);
  // Quando o valor muda por fora (importação), recarrega o texto.
  if (valor !== ultimo && valor.join(juntar) !== separar(texto).join(juntar)) {
    setUltimo(valor);
    setTexto(valor.join(juntar));
  }
  return (
    <textarea
      className={`input ${className ?? ""}`}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        const v = separar(e.target.value);
        setUltimo(v);
        onChange(v);
      }}
    />
  );
}
