"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { adicionarVagaManual } from "@/app/actions";
import { Alerta, Button, Card } from "@/components/ui";

const VAZIO = { url: "", titulo: "", empresa: "", local: "", descricao: "" };

export function NovaVaga() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const campo = (k: keyof typeof VAZIO) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }),
  });

  if (!aberto) return <Button variante="secundario" onClick={() => setAberto(true)}>+ Vaga manual</Button>;

  return (
    <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-16">
      <Card className="w-full max-w-lg space-y-3">
        <h2 className="font-semibold">Adicionar vaga encontrada fora do radar</h2>
        <div><label className="label">Link da vaga *</label><input className="input" {...campo("url")} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Título *</label><input className="input" {...campo("titulo")} /></div>
          <div><label className="label">Empresa</label><input className="input" {...campo("empresa")} /></div>
        </div>
        <div><label className="label">Local / modelo</label><input className="input" placeholder="Remoto, São Paulo - SP…" {...campo("local")} /></div>
        <div>
          <label className="label">Descrição (cole o texto da vaga — melhora muito o CV adaptado)</label>
          <textarea className="input h-40" {...campo("descricao")} />
        </div>
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <div className="flex justify-end gap-2">
          <Button variante="fantasma" onClick={() => setAberto(false)}>Cancelar</Button>
          <Button
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await adicionarVagaManual(f);
                if (!r.ok) return setErro(r.error ?? "Erro");
                setAberto(false);
                setF(VAZIO);
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
