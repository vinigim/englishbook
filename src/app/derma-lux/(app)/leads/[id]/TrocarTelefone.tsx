"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatPhoneKeyBR } from "../../../leads-shared";
import { trocarTelefoneLead } from "../../../leads-actions";

/**
 * "Trocar telefone": o mesmo lead passa a usar outro número.
 *
 * É o caminho para quando a prospecção acha o celular de quem estava com o
 * fixo. Antes isso virava lead novo e o antigo era arquivado à mão, levando a
 * conversa, as análises e as locações junto. O número velho fica listado aqui
 * e continua reconhecido pela sincronização do WhatsApp.
 */
export function TrocarTelefone({
  leadId,
  anteriores,
}: {
  leadId: string;
  anteriores: string[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [outro, setOutro] = useState<{ id: string; nome: string } | null>(null);
  const [salvando, startSalvar] = useTransition();

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOutro(null);
    startSalvar(async () => {
      const r = await trocarTelefoneLead(leadId, numero);
      if (!r.ok) {
        setErro(r.error ?? "Não consegui trocar o número.");
        setOutro(r.outro ?? null);
        return;
      }
      setAberto(false);
      setNumero("");
      router.refresh();
    });
  }

  return (
    <div className="text-xs text-muted">
      {anteriores.length > 0 ? (
        <p>
          Antes: {anteriores.map(formatPhoneKeyBR).join(", ")}
        </p>
      ) : null}
      {aberto ? (
        <form onSubmit={salvar} className="mt-1.5 space-y-1.5 max-w-xs">
          <Input
            type="tel"
            inputMode="tel"
            autoFocus
            placeholder="Novo número com DDD"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="h-9 text-sm"
          />
          <p>
            O número atual vai para &quot;Antes&quot;. Conversa, análises e locações
            continuam neste lead.
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={salvando || !numero.trim()}>
              {salvando ? "Trocando…" : "Trocar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAberto(false);
                setErro(null);
                setOutro(null);
              }}
            >
              Cancelar
            </Button>
          </div>
          {erro ? (
            <p className="text-accent font-medium">
              {erro}{" "}
              {outro ? (
                <Link href={`/derma-lux/leads/${outro.id}`} className="underline">
                  Abrir esse lead
                </Link>
              ) : null}
              {outro ? (
                <span className="block font-normal text-muted mt-1">
                  Se é a mesma pessoa, use &quot;Juntar com outro lead&quot;.
                </span>
              ) : null}
            </p>
          ) : null}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="underline hover:text-ink"
        >
          Trocar telefone
        </button>
      )}
    </div>
  );
}
