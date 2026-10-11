import { headers } from "next/headers";
import { Alert } from "@/components/ui/Badge";
import { createClient } from "@/lib/supabase/server";
import { getDermaLuxData } from "../../../data";
import { numeroDaLux } from "../../../janela-link";
import { calcularJanelas, DESCONTO_JANELA, HORIZONTE_DIAS, RAIO_KM } from "../../../janelas";
import { getLeadsInbox } from "../../../leads-data";
import { VoltarAoRadar } from "../VoltarAoRadar";
import { JanelasClient, type EstadoOferta } from "./JanelasClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Janelas da rota — Lux Derma",
};

/** yyyy-mm-dd em São Paulo, e não no fuso do servidor (UTC na Vercel). */
function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
}

/**
 * "https://<domínio>/j/", do próprio pedido: o link sai com o domínio em que o
 * painel está aberto, sem mais uma variável de ambiente para manter.
 */
async function baseDoLink(): Promise<string | null> {
  if (!numeroDaLux()) return null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/j/`;
}

/** Cliques e respostas das ofertas na tela. Sem a 0023, nenhuma. */
async function estadosDasOfertas(codigos: string[]): Promise<Record<string, EstadoOferta>> {
  if (codigos.length === 0) return {};
  const supabase = await createClient();
  const saida: Record<string, EstadoOferta> = {};
  // Em lotes: o filtro vai na URL (ver ID_CHUNK em leads-data.ts).
  for (let i = 0; i < codigos.length; i += 150) {
    const { data, error } = await supabase
      .from("janela_ofertas")
      .select("codigo, cliques, primeiro_clique_em, respondida_em, resposta_lead_id")
      .in("codigo", codigos.slice(i, i + 150));
    if (error) return {};
    for (const o of (data ?? []) as (EstadoOferta & { codigo: string })[]) saida[o.codigo] = o;
  }
  return saida;
}

export default async function JanelasPage() {
  const [{ equipment, rentals, blocks }, rows, linkBase] = await Promise.all([
    getDermaLuxData(),
    getLeadsInbox(),
    baseDoLink(),
  ]);

  const resultado = calcularJanelas({
    equipment,
    rentals,
    blocks,
    rows,
    hoje: hojeSaoPaulo(),
    linkBase,
  });
  const ofertas = await estadosDasOfertas(
    resultado.janelas
      .flatMap((j) => [...j.candidatos, ...j.porDdd])
      .map((c) => c.codigo)
      .filter((c): c is string => c !== null),
  );

  return (
    <div>
      <VoltarAoRadar />
      <div className="mb-6">
        <h1 className="font-display text-3xl text-ink tracking-tight">Janelas da rota</h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">
          Dias livres colados a uma locação dos próximos {HORIZONTE_DIAS} dias. O laser já vai
          estar na região, então quem está a até {RAIO_KM} km (em linha reta) recebe a data com{" "}
          {Math.round(DESCONTO_JANELA * 100)}% de desconto na locação.
        </p>
      </div>

      {rows.length === 0 ? (
        <Alert variant="info" className="mb-4">
          O Radar não devolveu nenhum lead. Sem leads (ou sem acesso a eles), não há a quem
          oferecer as janelas.
        </Alert>
      ) : null}

      {!linkBase ? (
        <Alert variant="info" className="mb-4">
          Para a mensagem do Instagram levar um link que abre o WhatsApp da Lux com o interesse
          já escrito, configure <code>LUX_WHATSAPP</code> (o número comercial, com DDD) na
          Vercel e refaça o deploy.
        </Alert>
      ) : null}

      <JanelasClient resultado={resultado} ofertas={ofertas} />
    </div>
  );
}
