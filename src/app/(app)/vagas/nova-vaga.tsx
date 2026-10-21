"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adicionarVagaManual } from "@/app/actions";
import { Alerta, Button, Card } from "@/components/ui";

const VAZIO = { url: "", titulo: "", empresa: "", local: "", descricao: "" };

const MODELO_LABEL: Record<string, string> = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };

interface VagaExtraida {
  titulo: string;
  empresa: string;
  local: string;
  modelo: string;
  descricao: string;
  origem: "pagina" | "ia";
}

/** "São Paulo - SP" + híbrido → "São Paulo - SP · Híbrido" (o servidor deduz o modelo deste texto). */
function localComModelo(v: VagaExtraida): string {
  const modelo = MODELO_LABEL[v.modelo];
  if (!modelo) return v.local;
  if (!v.local) return modelo;
  return new RegExp(modelo.slice(0, 5), "i").test(v.local) ? v.local : `${v.local} · ${modelo}`;
}

export function NovaVaga() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [pendente, iniciar] = useTransition();

  async function lerLink(url: string) {
    if (!/^https?:\/\/\S+\.\S+/i.test(url.trim())) return setErro("Cole o link completo da vaga (https://…).");
    setLendo(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/vagas/extrair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) return setErro(corpo.mensagem ?? "Não consegui ler esse link.");
      const v: VagaExtraida = corpo.vaga;
      setF((atual) => ({
        ...atual,
        titulo: v.titulo || atual.titulo,
        empresa: v.empresa || atual.empresa,
        local: localComModelo(v) || atual.local,
        descricao: v.descricao || atual.descricao,
      }));
      setAviso(
        v.origem === "ia"
          ? "Campos preenchidos pela IA a partir da página. Confira antes de salvar."
          : "Campos preenchidos a partir da página. Confira antes de salvar.",
      );
    } catch {
      setErro("Não consegui ler esse link.");
    } finally {
      setLendo(false);
    }
  }

  const campo = (k: keyof typeof VAZIO) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }),
  });

  if (!aberto) return <Button variante="secundario" onClick={() => setAberto(true)}>+ Vaga manual</Button>;

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16">
      <Card className="w-full max-w-lg space-y-3">
        <h2 className="font-semibold">Adicionar vaga encontrada fora do radar</h2>
        <div>
          <label className="label">Link da vaga *</label>
          <div className="flex gap-2">
            <input
              className="input"
              {...campo("url")}
              onPaste={(e) => {
                // Colou o link num formulário ainda vazio: já busca os campos.
                const colado = e.clipboardData.getData("text").trim();
                if (colado && !f.titulo && !f.descricao) setTimeout(() => lerLink(colado));
              }}
            />
            <Button variante="secundario" className="shrink-0" disabled={lendo || !f.url.trim()} onClick={() => lerLink(f.url)}>
              {lendo ? "Lendo…" : "Ler vaga"}
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {lendo ? "Abrindo o link e extraindo os dados da vaga…" : "Cole o link e os campos são preenchidos a partir da página."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Título *</label><input className="input" {...campo("titulo")} /></div>
          <div><label className="label">Empresa</label><input className="input" {...campo("empresa")} /></div>
        </div>
        <div><label className="label">Local / modelo</label><input className="input" placeholder="Remoto, São Paulo - SP…" {...campo("local")} /></div>
        <div>
          <label className="label">Descrição (cole o texto da vaga — melhora muito o CV adaptado)</label>
          <textarea className="input h-40" {...campo("descricao")} />
        </div>
        {aviso && !erro && <Alerta tipo="ok">{aviso}</Alerta>}
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <div className="flex justify-end gap-2">
          <Button variante="fantasma" onClick={() => setAberto(false)}>Cancelar</Button>
          <Button
            disabled={pendente || lendo}
            onClick={() =>
              iniciar(async () => {
                const r = await adicionarVagaManual(f);
                if (!r.ok) return setErro(r.error ?? "Erro");
                setAberto(false);
                setF(VAZIO);
                setAviso(null);
                router.push(`/vagas/${r.id}`);
              })
            }
          >
            {pendente ? "Salvando e avaliando…" : "Salvar"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
