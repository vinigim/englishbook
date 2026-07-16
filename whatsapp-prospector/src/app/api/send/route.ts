import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getConfig,
  isConfigured,
  sendTemplateMessage,
} from "@/lib/whatsapp";
import type { SendResultLine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sem cap curto: o disparo com intervalo pode levar minutos (rodando local).
export const maxDuration = 300;

const ContactSchema = z.object({
  index: z.number().int(),
  name: z.string().default(""),
  to: z.string(), // E.164 sem "+", ou vazio quando inválido
  variables: z.array(z.string()).default([]),
});

const BodySchema = z.object({
  templateName: z.string().min(1, "templateName é obrigatório"),
  languageCode: z.string().min(2).default("pt_BR"),
  delayMs: z.number().int().min(0).max(60000).optional(),
  dryRun: z.boolean().default(false),
  contacts: z.array(ContactSchema).min(1, "nenhum contato enviado"),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DIGITS_ONLY = /^\d{8,15}$/;

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.errors.map((e) => e.message).join("; ")
        : "corpo inválido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const cfg = getConfig();
  const dryRun = body.dryRun;

  if (!dryRun && !isConfigured(cfg)) {
    return new Response(
      JSON.stringify({
        error:
          "Credenciais da Cloud API não configuradas. Defina WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env, ou use o modo simulação (dry run).",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const delayMs =
    body.delayMs ?? Number(process.env.SEND_DELAY_MS ?? "4000") ?? 4000;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (line: SendResultLine) => {
        controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      };

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (let i = 0; i < body.contacts.length; i++) {
        const c = body.contacts[i];

        // Número inválido -> pula sem gastar chamada de API.
        if (!c.to || !DIGITS_ONLY.test(c.to)) {
          skipped++;
          emit({
            index: c.index,
            name: c.name,
            phoneE164: c.to || null,
            status: "skipped",
            error: "telefone inválido ou ausente",
          });
          continue;
        }

        if (dryRun) {
          sent++;
          emit({
            index: c.index,
            name: c.name,
            phoneE164: c.to,
            status: "sent",
            messageId: "dry-run",
          });
        } else {
          const result = await sendTemplateMessage(cfg, {
            to: c.to,
            templateName: body.templateName,
            languageCode: body.languageCode,
            bodyVariables: c.variables,
          });

          if (result.ok) {
            sent++;
            emit({
              index: c.index,
              name: c.name,
              phoneE164: c.to,
              status: "sent",
              messageId: result.messageId,
            });
          } else {
            failed++;
            emit({
              index: c.index,
              name: c.name,
              phoneE164: c.to,
              status: "failed",
              error: result.error,
            });
          }
        }

        // Ritmo entre envios (não espera depois do último).
        const isLast = i === body.contacts.length - 1;
        if (!isLast && delayMs > 0) await sleep(delayMs);
      }

      // Linha final de resumo (index -1 sinaliza "done").
      controller.enqueue(
        encoder.encode(
          JSON.stringify({ done: true, sent, failed, skipped }) + "\n",
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
