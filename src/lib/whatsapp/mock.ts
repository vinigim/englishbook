import { readFile } from "node:fs/promises";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import {
  asArray,
  normalizeOne,
  type EvolutionRawMessage,
} from "./evolution";
import {
  isGroupJid,
  jidToPhone,
  toIsoDate,
  type NormalizedMessage,
  type WaChat,
  type WaConnection,
  type WebhookRequest,
  type WhatsAppProvider,
} from "./provider";

/**
 * Provedor de mentira, alimentado por arquivos em src/lib/whatsapp/fixtures/.
 *
 * Serve para construir e testar todo o resto — ingestão, análise, telas — sem
 * subir o servidor da Evolution e, principalmente, sem expor o número real da
 * empresa ao risco de banimento enquanto o sistema ainda está em obras.
 *
 * As fixtures usam o MESMO formato da Evolution e passam pelo MESMO parser, de
 * modo que testar com fixture exercita o código que vai rodar em produção.
 */

const FIXTURES_DIR = path.join(process.cwd(), "src/lib/whatsapp/fixtures");

function secretsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

async function loadHistory(): Promise<EvolutionRawMessage[]> {
  try {
    const conteudo = await readFile(
      path.join(FIXTURES_DIR, "history.json"),
      "utf8",
    );
    const parsed: unknown = JSON.parse(conteudo);
    return asArray(parsed);
  } catch {
    // Sem fixture é um cenário legítimo: significa "nenhuma conversa ainda".
    return [];
  }
}

export function createMockProvider(): WhatsAppProvider {
  return {
    id: "mock",

    verifyWebhook({ url, headers }: WebhookRequest): boolean {
      const esperado = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
      // Em desenvolvimento, sem segredo configurado, o webhook fica aberto —
      // é o mesmo critério do validateCronRequest em src/lib/cron.ts.
      if (!esperado) return process.env.NODE_ENV !== "production";

      const fornecido =
        headers.get("x-webhook-token") ?? url.searchParams.get("s") ?? "";
      return secretsMatch(fornecido, esperado);
    },

    eventId(payload: unknown): string | null {
      const p = payload as { event?: string; data?: unknown } | null;
      if (!p) return null;
      if (p.event && !p.event.startsWith("messages.")) return null;

      const ids = asArray(p.data)
        .map((m) => m?.key?.id)
        .filter((id): id is string => Boolean(id));

      if (ids.length === 0) return null;
      return ids.length === 1 ? ids[0] : `batch:${ids.join(",").slice(0, 200)}`;
    },

    normalizeInbound(payload: unknown): NormalizedMessage[] {
      const p = payload as { data?: unknown } | null;
      if (!p) return [];
      return asArray(p.data)
        .map(normalizeOne)
        .filter((m): m is NormalizedMessage => m !== null);
    },

    async listChats(opts): Promise<WaChat[]> {
      const historico = await loadHistory();
      const porChat = new Map<string, WaChat>();

      for (const raw of historico) {
        const jid = raw?.key?.remoteJid;
        if (!jid) continue;
        const quando = toIsoDate(raw.messageTimestamp);
        const atual = porChat.get(jid);
        if (!atual) {
          porChat.set(jid, {
            chatId: jid,
            phoneE164: jidToPhone(jid),
            name: raw.pushName ?? null,
            isGroup: isGroupJid(jid),
            lastMessageAt: quando,
          });
        } else if (!atual.lastMessageAt || quando > atual.lastMessageAt) {
          atual.lastMessageAt = quando;
          atual.name = atual.name ?? raw.pushName ?? null;
        }
      }

      const chats = [...porChat.values()].sort((a, b) =>
        (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""),
      );
      return opts?.limit ? chats.slice(0, opts.limit) : chats;
    },

    async fetchChatHistory(chatId, opts): Promise<NormalizedMessage[]> {
      const historico = await loadHistory();
      const mensagens = historico
        .filter((raw) => raw?.key?.remoteJid === chatId)
        .map(normalizeOne)
        .filter((m): m is NormalizedMessage => m !== null)
        .sort((a, b) => a.sentAt.localeCompare(b.sentAt));

      return opts?.limit ? mensagens.slice(0, opts.limit) : mensagens;
    },

    async sendText(phoneE164, text) {
      console.log(`[wa-mock] enviaria para ${phoneE164}: ${text.slice(0, 80)}…`);
      return { providerMessageId: `mock-${Date.now()}` };
    },

    async connectionStatus(): Promise<WaConnection> {
      const historico = await loadHistory();
      return {
        connected: true,
        label: `fixtures (${historico.length} mensagens)`,
      };
    },
  };
}
