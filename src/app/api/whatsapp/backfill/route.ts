import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { ingestMessages } from "@/lib/whatsapp/ingest";
import type {
  NormalizedMessage,
  PendingLidMessage,
} from "@/lib/whatsapp/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Importa o histórico das conversas que já existem no WhatsApp.
 *
 * Responde em NDJSON (uma linha por chat processado) para a tela mostrar
 * andamento.
 *
 * É retomável e idempotente: o progresso fica em wa_sync_state e a constraint
 * unique (provider, provider_message_id) garante que rodar de novo não
 * duplica nada. Rodar dez vezes dá o mesmo resultado de rodar uma.
 */

// Deixa margem sobre o maxDuration de 300s para fechar o stream com
// elegância, em vez de ser cortado no meio por timeout da plataforma.
const LIMITE_MS = 250_000;

/**
 * Mensagens por página.
 *
 * Grande o bastante para a carteira inteira caber em poucas dezenas de
 * chamadas, pequeno o bastante para o JSON de cada resposta não ficar pesado —
 * cada mensagem carrega o payload bruto do Baileys.
 */
const PAGE_SIZE = 200;

/** Trava contra laço infinito se o provedor nunca sinalizar fim de dados. */
const MAX_PAGINAS = 200;

/** Mensagens por chamada ao gravar as recuperadas. */
const LOTE_INGEST = 200;

const bodySchema = z.object({
  /**
   * Percorre TODAS as páginas, em vez de parar na primeira já conhecida.
   *
   * O modo incremental para cedo porque a listagem vem da mais recente para a
   * mais antiga: página inteira já conhecida significa que chegamos ao que já
   * tínhamos. Isso é errado depois de ligar o Sync Full History no Evolution,
   * porque aí o histórico novo entra pelo FIM da lista — daí o "Reler tudo".
   */
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    const texto = await request.text();
    if (texto.trim()) body = JSON.parse(texto);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { force = false } = parsed.data;

  const provider = getWhatsAppProvider();
  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    console.error("[wa-backfill] SUPABASE_SERVICE_ROLE_KEY ausente");
    return NextResponse.json(
      { error: "admin_not_configured", message: adminResult.message },
      { status: 500 },
    );
  }
  const admin = adminResult.admin;
  const inicio = Date.now();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const linha = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        linha({ tipo: "inicio", pageSize: PAGE_SIZE });

        let pagina = 0;
        let mensagensVistas = 0;
        let mensagensTotal = 0;
        let leadsTotal = 0;
        let semTelefone = 0;
        let brutasTotal = 0;
        let descartadasOutras = 0;
        // DOIS mapas, com precedências diferentes.
        //
        // `lidMapAlt` vem do remoteJidAlt de mensagens que passaram pelo fluxo
        // ao vivo: é verdade conhecida, dita pelo próprio WhatsApp.
        //
        // `lidMapNome` vem de cruzar a agenda do provedor por nome: a mesma
        // pessoa aparece duas vezes, uma com telefone e outra por LID. É
        // INFERÊNCIA, e por isso perde para o alt sempre que os dois existem.
        const lidMapAlt: Record<string, string> = {};
        let lidMapNome: Record<string, string> = {};
        let nomeUnicos = 0;
        let nomeAmbiguos = 0;
        const pendentes: PendingLidMessage[] = [];

        if (provider.fetchLidMap) {
          try {
            const r = await provider.fetchLidMap();
            lidMapNome = r.map;
            nomeUnicos = r.unicos;
            nomeAmbiguos = r.ambiguos;
            linha({
              tipo: "agenda",
              unicos: r.unicos,
              ambiguos: r.ambiguos,
              semPar: r.semPar,
            });
          } catch (err) {
            // Agenda indisponível não pode derrubar a sincronização: sem ela,
            // o backfill volta a depender só do remoteJidAlt.
            console.error("[wa-backfill] falha ao cruzar agenda:", err);
          }
        }
        let continuar = false;

        for (;;) {
          if (Date.now() - inicio > LIMITE_MS) {
            continuar = true;
            linha({
              tipo: "parcial",
              mensagem: "Tempo limite atingido. Continuando de onde parou…",
            });
            break;
          }

          pagina += 1;
          if (pagina > MAX_PAGINAS) {
            continuar = true;
            linha({
              tipo: "parcial",
              mensagem: "Muitas páginas numa rodada. Continuando…",
            });
            break;
          }

          const lote = await provider.fetchMessagesPage({
            page: pagina,
            pageSize: PAGE_SIZE,
          });

          // Fim dos dados se decide pelo que o provedor DEVOLVEU, nunca pelo
          // que sobrou depois de normalizar. Olhando só o que sobrou, uma
          // página cheia de mensagens descartáveis parece fim da lista, e a
          // varredura morre na primeira página sem dizer por quê.
          const ultimaPagina = lote.brutas < PAGE_SIZE;

          brutasTotal += lote.brutas;
          descartadasOutras += lote.descartadasOutras;
          Object.assign(lidMapAlt, lote.lidMap);
          pendentes.push(...lote.pendentes);

          if (lote.mensagens.length > 0) {
            const resultado = await ingestMessages(
              admin,
              provider.id,
              lote.mensagens,
            );
            mensagensVistas += lote.mensagens.length;
            mensagensTotal += resultado.mensagensGravadas;
            leadsTotal += resultado.leadsCriados;
            semTelefone += resultado.telefoneInvalido;

            linha({
              tipo: "pagina",
              pagina,
              brutas: lote.brutas,
              recebidas: lote.mensagens.length,
              gravadas: resultado.mensagensGravadas,
              vistas: mensagensVistas,
            });

            // Modo incremental: a listagem vem da mais recente para a mais
            // antiga, então uma página inteira já conhecida significa que
            // chegamos ao que já tínhamos. "Reler tudo" (force) ignora isso,
            // porque o histórico novo do WhatsApp chega pelo FIM da lista —
            // é justamente o caso em que parar cedo esconderia tudo.
            if (!force && resultado.mensagensGravadas === 0) break;
          }

          if (ultimaPagina) break;
        }

        // ------------------------------------------------ segunda passada
        //
        // Agora o mapa está fechado. As mensagens que só tinham LID e cujo
        // telefone apareceu em ALGUMA página viram mensagens de verdade.
        //
        // É aqui que o histórico é recuperado: 99,6% das mensagens chegam
        // cruas, e basta UM par LID→telefone por contato — venha do
        // remoteJidAlt de uma mensagem ou do cruzamento da agenda — para
        // trazer a conversa inteira dele.
        let recuperadas = 0;
        let semMapa = 0;
        const resolvidas: NormalizedMessage[] = [];

        // Verdade conhecida primeiro, inferência depois.
        const resolverLid = (lid: string) => lidMapAlt[lid] ?? lidMapNome[lid];
        let porAlt = 0;
        let porNome = 0;

        for (const p of pendentes) {
          const telefone = resolverLid(p.lid);
          if (!telefone) {
            semMapa += 1;
            continue;
          }
          if (lidMapAlt[p.lid]) porAlt += 1;
          else porNome += 1;
          resolvidas.push(p.resolver(telefone));
        }

        // Em lotes: são milhares, e mandar tudo de uma vez estoura payload.
        for (let i = 0; i < resolvidas.length; i += LOTE_INGEST) {
          if (Date.now() - inicio > LIMITE_MS) {
            continuar = true;
            linha({
              tipo: "parcial",
              mensagem: "Tempo limite ao gravar as recuperadas. Rode de novo.",
            });
            break;
          }

          const lote = resolvidas.slice(i, i + LOTE_INGEST);
          const resultado = await ingestMessages(admin, provider.id, lote);
          recuperadas += lote.length;
          mensagensVistas += lote.length;
          mensagensTotal += resultado.mensagensGravadas;
          leadsTotal += resultado.leadsCriados;
          semTelefone += resultado.telefoneInvalido;

          linha({
            tipo: "recuperacao",
            recuperadas,
            total: resolvidas.length,
          });
        }

        // ------------------------------------------ conciliar a agenda
        //
        // Leads novos acabaram de entrar, e é agora que o vínculo com os
        // aluguéis envelhece. Fazer aqui evita mais um botão que ninguém
        // lembra de apertar — foi o que aconteceu com a limpeza e com o
        // teste de conexão.
        //
        // Idempotente: só toca em aluguel com wa_lead_id nulo.
        let conciliados = 0;
        try {
          const { data, error } = await admin.rpc("conciliar_rentals");
          if (error) throw new Error(error.message);
          conciliados = Number(data) || 0;
        } catch (err) {
          // Conciliação é um extra: falhar aqui não pode invalidar um
          // backfill que já gravou tudo.
          console.error("[wa-backfill] falha ao conciliar agenda:", err);
        }

        linha({
          tipo: "fim",
          conciliados,
          paginas: pagina,
          brutasTotal,
          recuperadas,
          semMapa,
          lidsConhecidos: Object.keys(lidMapAlt).length + Object.keys(lidMapNome).length,
          porAlt,
          porNome,
          nomeUnicos,
          nomeAmbiguos,
          descartadasOutras,
          mensagensVistas,
          continuar,
          mensagensGravadas: mensagensTotal,
          leadsNovos: leadsTotal,
          semTelefone,
          segundos: Math.round((Date.now() - inicio) / 1000),
        });
      } catch (err) {
        console.error("[wa-backfill] falha geral:", err);
        linha({
          tipo: "erro",
          mensagem: err instanceof Error ? err.message : "falha",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
