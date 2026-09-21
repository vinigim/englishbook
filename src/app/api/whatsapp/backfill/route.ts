import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { ingestMessages } from "@/lib/whatsapp/ingest";

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

const bodySchema = z.object({
  chatLimit: z.number().int().positive().max(500).optional(),
  messagesPerChat: z.number().int().positive().max(2000).optional(),
  /** Reprocessa chats já marcados como concluídos. */
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

  const { chatLimit, messagesPerChat = 500, force = false } = parsed.data;

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
        const chats = await provider.listChats(
          chatLimit ? { limit: chatLimit } : undefined,
        );

        const conversas = chats.filter((c) => !c.isGroup);
        linha({
          tipo: "inicio",
          totalChats: conversas.length,
          gruposIgnorados: chats.length - conversas.length,
        });

        // Quais já terminamos, para não refazer trabalho.
        const concluidos = new Set<string>();
        if (!force) {
          const { data } = await admin
            .from("wa_sync_state")
            .select("chat_id")
            .eq("done", true);
          for (const r of (data ?? []) as { chat_id: string }[]) {
            concluidos.add(r.chat_id);
          }
        }

        let processados = 0;
        let mensagensTotal = 0;
        let leadsTotal = 0;

        for (const chat of conversas) {
          if (Date.now() - inicio > LIMITE_MS) {
            linha({
              tipo: "parcial",
              restantes: conversas.length - processados,
              mensagem:
                "Tempo limite atingido. Rode de novo para continuar de onde parou.",
            });
            break;
          }

          if (concluidos.has(chat.chatId)) {
            processados += 1;
            continue;
          }

          try {
            const historico = await provider.fetchChatHistory(chat.chatId, {
              limit: messagesPerChat,
            });

            const resultado = await ingestMessages(
              admin,
              provider.id,
              historico,
            );

            mensagensTotal += resultado.mensagensGravadas;
            leadsTotal += resultado.leadsCriados;

            const datas = historico.map((m) => m.sentAt).sort();

            await admin.from("wa_sync_state").upsert(
              {
                chat_id: chat.chatId,
                oldest_fetched_at: datas[0] ?? null,
                newest_fetched_at: datas[datas.length - 1] ?? null,
                // Voltou menos que o pedido: chegamos ao começo da conversa.
                done: historico.length < messagesPerChat,
              },
              { onConflict: "chat_id" },
            );

            linha({
              tipo: "chat",
              telefone: chat.phoneE164,
              nome: chat.name,
              recebidas: historico.length,
              gravadas: resultado.mensagensGravadas,
            });
          } catch (err) {
            // Um chat problemático não pode derrubar a sincronização inteira.
            console.error(`[wa-backfill] falha em ${chat.chatId}:`, err);
            linha({
              tipo: "erro",
              telefone: chat.phoneE164,
              mensagem: err instanceof Error ? err.message : "falha",
            });
          }

          processados += 1;
        }

        linha({
          tipo: "fim",
          chatsProcessados: processados,
          mensagensGravadas: mensagensTotal,
          leadsNovos: leadsTotal,
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
