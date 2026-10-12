"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Estado = { codigo: string | null; ultimoAcessoEm: string | null };

const ACESSO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Código pessoal do óculos Even G2: fixo, sem prazo, abre as 20 consultas
 * mais recentes (com ou sem locação). Fica fechado até pedir, para o código
 * não ficar à vista na tela.
 */
export function OculosPessoal() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function chamar(metodo: "GET" | "POST" | "DELETE") {
    if (metodo === "POST" && estado?.codigo && !confirm("Gerar outro código? O atual para de funcionar no óculos.")) {
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/laser/oculos/pessoal", { method: metodo });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setErro(json.message ?? json.error ?? "Falha ao falar com o servidor.");
      setEstado({ codigo: json.codigo ?? null, ultimoAcessoEm: json.ultimoAcessoEm ?? null });
    } catch {
      setErro("Falha de rede.");
    } finally {
      setCarregando(false);
    }
  }

  const link = "text-accent underline hover:text-ink disabled:opacity-50";

  return (
    <div className="mt-2 text-xs text-muted">
      {estado === null ? (
        <button type="button" className={link} disabled={carregando} onClick={() => chamar("GET")}>
          Meu código do óculos Even G2
        </button>
      ) : estado.codigo ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Óculos G2:{" "}
            <span className="font-mono text-sm text-ink tracking-widest">
              {estado.codigo.slice(0, 4)}-{estado.codigo.slice(4)}
            </span>
          </span>
          <span>
            fixo, abre as 20 consultas mais recentes
            {estado.ultimoAcessoEm
              ? ` · aberto no óculos em ${ACESSO.format(new Date(estado.ultimoAcessoEm))}`
              : " · ainda não aberto"}
          </span>
          <button type="button" className={link} disabled={carregando} onClick={() => chamar("POST")}>
            Gerar outro
          </button>
          <button type="button" className={link} disabled={carregando} onClick={() => chamar("DELETE")}>
            Cortar acesso
          </button>
          <button type="button" className={link} onClick={() => setEstado(null)}>
            Esconder
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Sem código. Com ele, o app do óculos abre as suas consultas mais
            recentes, com ou sem locação e sem prazo.
          </span>
          <Button size="sm" variant="secondary" loading={carregando} onClick={() => chamar("POST")}>
            Gerar meu código
          </Button>
        </div>
      )}
      {erro ? <p className="text-accent mt-1">{erro}</p> : null}
    </div>
  );
}
