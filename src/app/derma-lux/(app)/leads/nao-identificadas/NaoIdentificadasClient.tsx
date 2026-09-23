"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export type LeadOpcao = {
  id: string;
  nome: string;
  detalhe: string;
  /** Tudo que dá para digitar para achar o lead, já em minúsculas. */
  busca: string;
};

export type VinculoFeito = {
  lid: string;
  criadoEm: string;
  leadId: string | null;
  leadNome: string;
  leadDetalhe: string;
};

type Sugestao = { leadId: string; forca: "forte" | "fraca"; motivo: string };

type Conversa = {
  lid: string;
  sugestao: Sugestao | null;
  total: number;
  recebidas: number;
  enviadas: number;
  primeira: string | null;
  ultima: string | null;
  nome: string | null;
  trechos: { fromMe: boolean; sentAt: string; texto: string | null }[];
};

type Lista = { conversas: Conversa[]; paginas: number; chegouAoFim: boolean };

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function quando(iso: string | null): string {
  return iso ? DATA.format(new Date(iso)) : "—";
}

export function NaoIdentificadasClient({
  leads,
  vinculos,
}: {
  leads: LeadOpcao[];
  vinculos: VinculoFeito[];
}) {
  const [carregando, setCarregando] = useState(false);
  const [lista, setLista] = useState<Lista | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [vinculadas, setVinculadas] = useState<Record<string, string>>({});

  async function procurar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/whatsapp/nao-identificadas");
      const json = await res.json().catch(() => null);
      if (!res.ok) setErro(json?.message ?? json?.error ?? `Erro ${res.status}`);
      else setLista(json as Lista);
    } catch {
      setErro("A resposta não chegou. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  const pendentes = lista?.conversas.filter((c) => !(c.lid in vinculadas)) ?? [];

  return (
    <div>
      <VinculosFeitos vinculos={vinculos} />
      <BuscarTexto leads={leads} />

      <Button onClick={procurar} loading={carregando}>
        {lista ? "Procurar de novo" : "Procurar conversas"}
      </Button>
      {carregando ? (
        <p className="text-xs text-muted mt-2">
          Lendo o histórico inteiro do WhatsApp — leva até um minuto.
        </p>
      ) : null}
      {erro ? (
        <Alert variant="danger" className="mt-4">
          {erro}
        </Alert>
      ) : null}

      {lista ? (
        <div className="mt-6">
          <p className="text-sm text-muted mb-3">
            {pendentes.length === 0
              ? "Nenhuma conversa sem identificação."
              : `${pendentes.length} conversa(s) sem identificação, da mais recente para a mais antiga.`}
            {lista.chegouAoFim
              ? ""
              : " A leitura parou pelo tempo antes do fim do histórico — procure de novo depois de vincular estas."}
          </p>

          {Object.values(vinculadas).some(Boolean) ? (
            <Alert variant="info" className="mb-4">
              {Object.values(vinculadas)
                .filter(Boolean)
                .map((texto, i) => (
                  <p key={i}>{texto}</p>
                ))}
            </Alert>
          ) : null}

          <VincularSugestoesFortes
            conversas={pendentes}
            leads={leads}
            aoVincular={(lids, texto) =>
              setVinculadas((v) => ({
                ...v,
                ...Object.fromEntries(lids.map((lid, i) => [lid, i === 0 ? texto : ""])),
              }))
            }
          />

          <ul className="space-y-3">
            {pendentes.map((c) => (
              <ConversaItem
                key={c.lid}
                conversa={c}
                leads={leads}
                aoVincular={(texto) =>
                  setVinculadas((v) => ({ ...v, [c.lid]: texto }))
                }
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ConversaItem({
  conversa: c,
  leads,
  aoVincular,
}: {
  conversa: Conversa;
  leads: LeadOpcao[];
  aoVincular: (texto: string) => void;
}) {
  return (
    <li className="bg-paper border border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-lg text-ink tracking-tight">
          {c.nome ?? "Contato sem nome"}
        </span>
        <span className="text-xs text-muted shrink-0">{quando(c.ultima)}</span>
      </div>
      <p className="text-xs text-muted mt-0.5">
        {c.enviadas} enviada(s) por você · {c.recebidas} recebida(s) · desde{" "}
        {quando(c.primeira)} · código {c.lid}
      </p>

      {c.trechos.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {c.trechos.map((t, i) => (
            <li
              key={i}
              className={cn(
                "text-sm px-2 py-1 border",
                t.fromMe ? "bg-brand/5 border-brand/20" : "bg-line/40 border-line",
              )}
            >
              <span className="text-xs text-muted">
                {t.fromMe ? "Você" : "Contato"} · {quando(t.sentAt)} —{" "}
              </span>
              {t.texto}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted mt-2">Só mídia, sem texto.</p>
      )}

      <div className="mt-3">
        <VincularLead
          lid={c.lid}
          leads={leads}
          aoVincular={aoVincular}
          sugestao={c.sugestao}
        />
      </div>
    </li>
  );
}

/**
 * Escolher o lead e gravar o vínculo de um LID.
 *
 * Usado nos cartões da lista e nos resultados da busca por texto — que é onde
 * dá para reconhecer a conversa quando a lista não ajuda.
 */
function VincularLead({
  lid,
  leads,
  aoVincular,
  sugestao = null,
}: {
  lid: string;
  leads: LeadOpcao[];
  aoVincular: (texto: string) => void;
  sugestao?: Sugestao | null;
}) {
  const [busca, setBusca] = useState("");
  // A sugestão já vem escolhida: basta confirmar, ou "Trocar" se estiver errada.
  const [escolhido, setEscolhido] = useState<LeadOpcao | null>(
    () => (sugestao ? (leads.find((l) => l.id === sugestao.leadId) ?? null) : null),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  const opcoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo.length < 2) return [];
    return leads.filter((l) => l.busca.includes(termo)).slice(0, 8);
  }, [busca, leads]);

  async function vincular() {
    if (!escolhido) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/whatsapp/nao-identificadas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lid, leadId: escolhido.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(json?.message ?? json?.error ?? `Erro ${res.status}`);
        return;
      }
      const texto =
        json?.aviso ??
        `${escolhido.nome}: vinculada — ${json?.gravadas ?? 0} mensagem(ns) trazida(s)${
          json?.completo ? "" : " (o resto chega no próximo \"Reler tudo\")"
        }.`;
      setFeito(texto);
      aoVincular(texto);
    } catch {
      setErro("A resposta não chegou. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  if (feito) return <p className="text-sm font-medium">{feito}</p>;

  return (
    <div>
      {escolhido ? (
        <div className="flex flex-wrap items-center gap-2">
          {sugestao && sugestao.leadId === escolhido.id ? (
            <span
              className={cn(
                "w-full text-xs",
                sugestao.forca === "forte" ? "text-ink" : "text-accent",
              )}
            >
              {sugestao.forca === "forte" ? "Sugestão" : "Sugestão — confira"}:{" "}
              {sugestao.motivo}.
            </span>
          ) : null}
          <span className="text-sm">
            Vincular a <strong>{escolhido.nome}</strong>
            {escolhido.detalhe ? (
              <span className="text-muted"> ({escolhido.detalhe})</span>
            ) : null}
            ?
          </span>
          <Button size="sm" onClick={vincular} loading={salvando}>
            Confirmar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEscolhido(null)}
            disabled={salvando}
          >
            Trocar
          </Button>
        </div>
      ) : (
        <>
          {/* text-base no celular: abaixo de 16px o Safari dá zoom no foco. */}
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="A qual lead pertence? Digite nome, clínica, cidade ou telefone"
            className="w-full px-3 py-2 text-base sm:text-sm bg-paper border border-line focus:border-ink focus:outline-none"
          />
          {opcoes.length > 0 ? (
            <ul className="mt-1 border border-line divide-y divide-line">
              {opcoes.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setEscolhido(l)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-line/40"
                  >
                    {l.nome}
                    {l.detalhe ? <span className="text-muted"> · {l.detalhe}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
      {erro ? <p className="text-sm text-accent mt-2">{erro}</p> : null}
    </div>
  );
}

/**
 * Os vínculos já feitos, do mais recente para o mais antigo.
 *
 * Existe porque escolher o lead errado é fácil — há duas "Dermacor" na
 * planilha — e antes não havia como voltar atrás.
 */
function VinculosFeitos({ vinculos }: { vinculos: VinculoFeito[] }) {
  const router = useRouter();
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  if (vinculos.length === 0 && !aviso) return null;

  async function desfazer(v: VinculoFeito) {
    const ok = window.confirm(
      `Desfazer o vínculo com ${v.leadNome}? As mensagens desta conversa saem da tela dele, e a conversa volta para a lista para ser vinculada de novo.`,
    );
    if (!ok) return;
    setDesfazendo(v.lid);
    setAviso(null);
    try {
      const res = await fetch("/api/whatsapp/nao-identificadas", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lid: v.lid }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setAviso(json?.message ?? json?.error ?? `Erro ${res.status}`);
      } else {
        setAviso(
          `Vínculo com ${v.leadNome} desfeito — ${json?.removidas ?? 0} mensagem(ns) saíram da tela dele. Procure as conversas de novo para vincular ao lead certo.`,
        );
        router.refresh();
      }
    } catch {
      setAviso("A resposta não chegou. Tente de novo.");
    } finally {
      setDesfazendo(null);
    }
  }

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl text-ink tracking-tight mb-2">
        Vínculos já feitos
      </h2>
      {aviso ? (
        <Alert variant="info" className="mb-3">
          {aviso}
        </Alert>
      ) : null}
      <ul className="space-y-2">
        {vinculos.map((v) => (
          <li
            key={v.lid}
            className="bg-paper border border-line p-3 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="text-sm">
              {v.leadId ? (
                <Link
                  href={`/derma-lux/leads/${v.leadId}`}
                  className="font-medium underline"
                >
                  {v.leadNome}
                </Link>
              ) : (
                <span className="font-medium">{v.leadNome}</span>
              )}
              {v.leadDetalhe ? (
                <span className="text-muted"> · {v.leadDetalhe}</span>
              ) : null}
              <span className="block text-xs text-muted">
                vinculado em {quando(v.criadoEm)}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              loading={desfazendo === v.lid}
              onClick={() => desfazer(v)}
            >
              Desfazer
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Achado = {
  sentAt: string;
  fromMe: boolean;
  trecho: string;
  pushName: string | null;
  telefone: string | null;
  via: "telefone" | "alt" | "vinculo" | "nome" | null;
  lid: string | null;
  lead: { id: string; nome: string } | null;
};

const VIA: Record<NonNullable<Achado["via"]>, string> = {
  telefone: "pelo telefone",
  alt: "pelo WhatsApp",
  vinculo: "pelo seu vínculo",
  nome: "pelo NOME do contato (automático)",
};

/**
 * Procura um texto no histórico e mostra para onde cada mensagem vai.
 *
 * Para achar conversa que "sumiu": ligada pelo nome ao telefone errado, ela
 * não aparece como não identificada — cai no lead de outra pessoa.
 */
function BuscarTexto({ leads }: { leads: LeadOpcao[] }) {
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [achados, setAchados] = useState<Achado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    if (texto.trim().length < 3) return;
    setBuscando(true);
    setErro(null);
    setAchados(null);
    try {
      const res = await fetch("/api/whatsapp/buscar-texto", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) setErro(json?.message ?? json?.error ?? `Erro ${res.status}`);
      else setAchados((json?.achados ?? []) as Achado[]);
    } catch {
      setErro("A resposta não chegou. Tente de novo.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl text-ink tracking-tight mb-1">
        Procurar uma conversa pelo texto
      </h2>
      <p className="text-sm text-muted mb-2">
        Para achar uma conversa que não aparece em lugar nenhum: digite um
        trecho de uma mensagem e veja em qual lead ela está.
      </p>
      <div className="flex gap-2">
        {/* text-base no celular: abaixo de 16px o Safari dá zoom no foco. */}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") buscar();
          }}
          placeholder="Ex.: Canal de Atendimento da Dermacor"
          className="flex-1 min-w-0 px-3 py-2 text-base sm:text-sm bg-paper border border-line focus:border-ink focus:outline-none"
        />
        <Button onClick={buscar} loading={buscando} disabled={texto.trim().length < 3}>
          Buscar
        </Button>
      </div>
      {buscando ? (
        <p className="text-xs text-muted mt-2">Lendo o histórico — até um minuto.</p>
      ) : null}
      {erro ? <p className="text-sm text-accent mt-2">{erro}</p> : null}

      {achados ? (
        achados.length === 0 ? (
          <p className="text-sm text-muted mt-3">
            Nenhuma mensagem com esse texto no histórico do WhatsApp conectado.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {achados.map((a, i) => (
              <li key={i} className="bg-paper border border-line p-3 text-sm">
                <p className="text-xs text-muted">
                  {a.fromMe
                    ? "Você"
                    : a.pushName && /\p{L}/u.test(a.pushName)
                      ? a.pushName
                      : "Contato"}{" "}
                  · {quando(a.sentAt)}
                  {a.lid ? ` · código ${a.lid}` : ""}
                </p>
                <p className="mt-0.5">{a.trecho}</p>
                <p className="text-xs mt-1">
                  {a.telefone ? (
                    <>
                      Vai para{" "}
                      {a.lead ? (
                        <Link
                          href={`/derma-lux/leads/${a.lead.id}`}
                          className="underline font-medium"
                        >
                          {a.lead.nome}
                        </Link>
                      ) : (
                        <strong>nenhum lead</strong>
                      )}{" "}
                      ({a.telefone}), ligada {a.via ? VIA[a.via] : ""}.
                    </>
                  ) : (
                    <strong>Sem telefone — é uma conversa não identificada.</strong>
                  )}
                </p>
                {/* Um seletor por conversa, no primeiro resultado dela. */}
                {!a.telefone && a.lid && achados.findIndex((x) => x.lid === a.lid) === i ? (
                  <div className="mt-2">
                    <VincularLead lid={a.lid} leads={leads} aoVincular={() => {}} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

/**
 * Um toque para todas as sugestões FORTES — nome do contato igual ao de um
 * lead. As fracas ficam de fora de propósito: pedem conferência uma a uma.
 */
function VincularSugestoesFortes({
  conversas,
  leads,
  aoVincular,
}: {
  conversas: Conversa[];
  leads: LeadOpcao[];
  aoVincular: (lids: string[], texto: string) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const idsValidos = new Set(leads.map((l) => l.id));
  const fortes = conversas.filter(
    (c) => c.sugestao?.forca === "forte" && idsValidos.has(c.sugestao.leadId),
  );
  const fracas = conversas.filter((c) => c.sugestao?.forca === "fraca").length;

  if (fortes.length === 0 && fracas === 0) {
    return (
      <p className="text-sm text-muted mb-3">
        Nenhuma sugestão automática: o WhatsApp não repassou nomes que batam com
        os leads. Vincule pela busca de cada cartão.
      </p>
    );
  }

  async function vincularTodas() {
    const ok = window.confirm(
      `Vincular ${fortes.length} conversa(s) aos leads sugeridos? Dá para desfazer cada uma em "Vínculos já feitos".`,
    );
    if (!ok) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/whatsapp/nao-identificadas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vinculos: fortes.map((c) => ({ lid: c.lid, leadId: c.sugestao!.leadId })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(json?.message ?? json?.error ?? `Erro ${res.status}`);
        return;
      }
      aoVincular(
        fortes.map((c) => c.lid),
        json?.aviso ??
          `${json?.vinculados ?? fortes.length} conversa(s) vinculada(s) — ${json?.gravadas ?? 0} mensagem(ns) trazida(s)${
            json?.completo ? "" : " (o resto chega no próximo \"Reler tudo\")"
          }.`,
      );
    } catch {
      setErro("A resposta não chegou. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mb-4 p-3 border border-line bg-paper">
      <p className="text-sm">
        <strong>{fortes.length}</strong> conversa(s) com nome igual ao de um
        lead
        {fracas > 0 ? (
          <>
            {" "}
            e <strong>{fracas}</strong> com sugestão para conferir, marcada no
            cartão
          </>
        ) : null}
        .
      </p>
      {fortes.length > 0 ? (
        <Button size="sm" className="mt-2" onClick={vincularTodas} loading={salvando}>
          Vincular as {fortes.length} com nome igual
        </Button>
      ) : null}
      {erro ? <p className="text-sm text-accent mt-2">{erro}</p> : null}
    </div>
  );
}
