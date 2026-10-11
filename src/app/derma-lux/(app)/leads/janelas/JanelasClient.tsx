"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { copiarNaHora } from "@/lib/copiar";
import { instagramDirectUrl } from "@/lib/leads/instagram";
import { cn } from "@/lib/utils";
import type { Candidato, Janela, ResultadoJanelas } from "../../../janelas";
import { relativeDays } from "../../../leads-shared";
import { fmtDayHeading, toWhatsAppNumber } from "../../../shared";

/**
 * "Já ofereci" fica no navegador, por janela e lead. É um lembrete do dono
 * para não mandar a mesma janela duas vezes, não um fato: o que de fato saiu
 * pelo WhatsApp continua chegando pela sincronização, como em todo o Radar.
 */
const CHAVE_OFERECIDOS = "radar:janelas-oferecidas";

function lerOferecidos(): Set<string> {
  try {
    const bruto = localStorage.getItem(CHAVE_OFERECIDOS);
    return new Set(bruto ? (JSON.parse(bruto) as string[]) : []);
  } catch {
    return new Set();
  }
}

function gravarOferecidos(s: Set<string>) {
  try {
    // Só as últimas 500: janela vencida não volta, e a lista não cresce sem fim.
    localStorage.setItem(CHAVE_OFERECIDOS, JSON.stringify([...s].slice(-500)));
  } catch {
    // Navegador sem armazenamento: o marcador vale até fechar a tela.
  }
}

const PERIODO_LABEL = { dia: "dia inteiro livre", manha: "manhã livre", tarde: "tarde livre" };

function diaCurto(iso: string): string {
  const { day, dow } = fmtDayHeading(iso);
  return `${dow.replace("-feira", "")}, ${day}`;
}

export function JanelasClient({ resultado }: { resultado: ResultadoJanelas }) {
  const { janelas, semCidade, leadsSemCidade } = resultado;
  const [oferecidos, setOferecidos] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOferecidos(lerOferecidos());
  }, []);

  function alternar(chave: string) {
    setOferecidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      gravarOferecidos(novo);
      return novo;
    });
  }

  return (
    <div className="space-y-6">
      {janelas.length === 0 ? (
        <Alert variant="info" title="Nenhuma janela agora">
          Janela é um dia livre colado a uma locação marcada. Sem locação futura com cidade
          reconhecida, ou com os dias vizinhos ocupados, não há o que oferecer.
        </Alert>
      ) : (
        janelas.map((j) => (
          <JanelaCard key={j.chave} janela={j} oferecidos={oferecidos} alternar={alternar} />
        ))
      )}

      {semCidade.length > 0 ? (
        <Alert variant="warning" title="Locações sem cidade reconhecida">
          <p className="mb-2">
            Estas locações não geram janela porque não achei a cidade no endereço. Escreva
            &quot;Cidade - UF&quot; no fim do endereço na agenda (ou ligue a locação a um lead com
            cidade).
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {semCidade.map((a) => (
              <li key={a.rentalId}>
                {diaCurto(a.date)} · {a.client}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {leadsSemCidade > 0 ? (
        <p className="text-xs text-muted">
          {leadsSemCidade} leads não têm cidade reconhecida. Eles só aparecem pelo DDD, numa lista
          à parte em cada janela. Preencher a cidade na planilha e reimportar coloca-os no raio.
        </p>
      ) : null}
    </div>
  );
}

function JanelaCard({
  janela,
  oferecidos,
  alternar,
}: {
  janela: Janela;
  oferecidos: Set<string>;
  alternar: (chave: string) => void;
}) {
  const [verDdd, setVerDdd] = useState(false);
  const cidades = Array.from(
    new Map(
      janela.ancoras.map((a) => [`${a.cidade?.nome}/${a.cidade?.uf}`, a]),
    ).values(),
  );

  return (
    <Card variant="bordered" className="p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-display text-xl text-ink tracking-tight">
          {diaCurto(janela.date)} · {janela.equipNome}
        </h2>
        <Badge variant="info">{PERIODO_LABEL[janela.periodo]}</Badge>
      </div>
      <p className="text-sm text-muted mb-4">
        Colado em{" "}
        {janela.ancoras.map((a, i) => (
          <span key={a.rentalId}>
            {i > 0 ? " e " : ""}
            {a.client} ({diaCurto(a.date)}, {a.cidade?.nome}/{a.cidade?.uf})
          </span>
        ))}
        {cidades.some((a) => a.origem === "lead") ? " · cidade tirada da ficha do lead" : ""}
      </p>

      {janela.candidatos.length === 0 ? (
        <p className="text-sm text-muted">Nenhum lead com cidade a até 100 km.</p>
      ) : (
        <ul className="divide-y divide-line">
          {janela.candidatos.map((c) => (
            <CandidatoLinha
              key={c.leadId}
              janela={janela}
              c={c}
              oferecido={oferecidos.has(`${janela.chave}|${c.leadId}`)}
              alternar={alternar}
            />
          ))}
        </ul>
      )}
      {janela.totalCandidatos > janela.candidatos.length ? (
        <p className="text-xs text-muted mt-2">
          Mostrando os {janela.candidatos.length} primeiros de {janela.totalCandidatos} no raio.
        </p>
      ) : null}

      {janela.totalPorDdd > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setVerDdd((v) => !v)}
            className="text-sm text-muted hover:text-ink underline"
          >
            {verDdd ? "Esconder" : "Ver"} {janela.totalPorDdd} sem cidade, com o mesmo DDD
          </button>
          {verDdd ? (
            <ul className="divide-y divide-line mt-2">
              {janela.porDdd.map((c) => (
                <CandidatoLinha
                  key={c.leadId}
                  janela={janela}
                  c={c}
                  oferecido={oferecidos.has(`${janela.chave}|${c.leadId}`)}
                  alternar={alternar}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function CandidatoLinha({
  janela,
  c,
  oferecido,
  alternar,
}: {
  janela: Janela;
  c: Candidato;
  oferecido: boolean;
  alternar: (chave: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const numero = c.whatsapp === false ? null : toWhatsAppNumber(c.telefone);

  function copiar() {
    if (!copiarNaHora(c.mensagem)) void navigator.clipboard.writeText(c.mensagem).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <li className={cn("py-3", oferecido && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={`/derma-lux/leads/${c.leadId}`}
          className="font-medium text-ink hover:text-accent"
        >
          {c.nome}
        </Link>
        <span className="text-sm text-muted">
          {c.cidade ? `${c.cidade.nome}/${c.cidade.uf}` : `DDD ${c.ancora.cidade?.ddd}`}
          {c.km !== null ? ` · ${c.km === 0 ? "mesma cidade" : `${c.km} km`}` : ""}
        </span>
        {c.jaAlugou ? <Badge variant="success">já alugou</Badge> : null}
        {c.temperatura?.startsWith("quente") ? <Badge variant="danger">quente</Badge> : null}
        {c.temperatura === "morno" ? <Badge variant="warning">morno</Badge> : null}
        {c.interesseNoEquipamento ? <Badge variant="info">quer este laser</Badge> : null}
        {c.contato.estado === "devo_responder" ? (
          <Badge variant="danger">responder ele</Badge>
        ) : c.contato.estado === "aguardando_ele" && c.contato.desde ? (
          <span className="text-xs text-muted">
            ✓ mandei no {c.contato.canal} {relativeDays(c.contato.desde)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
        {numero ? (
          <a
            href={`https://wa.me/${numero}?text=${encodeURIComponent(c.mensagem)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline hover:text-accent"
          >
            Abrir no WhatsApp
          </a>
        ) : null}
        {c.instagram ? (
          <a
            href={instagramDirectUrl(c.instagram)}
            onClick={copiar}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline hover:text-accent"
          >
            Copiar e abrir no Instagram
          </a>
        ) : null}
        <button type="button" onClick={copiar} className="text-ink underline hover:text-accent">
          {copiado ? "Copiado ✓" : "Copiar mensagem"}
        </button>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="text-muted underline hover:text-ink"
        >
          {aberto ? "Esconder" : "Ver"} mensagem
        </button>
        <label className="flex items-center gap-1.5 text-muted cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={oferecido}
            onChange={() => alternar(`${janela.chave}|${c.leadId}`)}
          />
          já ofereci
        </label>
      </div>

      {aberto ? (
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm bg-line/40 p-3 text-ink">
          {c.mensagem}
        </pre>
      ) : null}
    </li>
  );
}
