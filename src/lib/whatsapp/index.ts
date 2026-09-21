import { createEvolutionProvider } from "./evolution";
import { createMockProvider } from "./mock";
import type { WhatsAppProvider } from "./provider";

export * from "./provider";

let cached: WhatsAppProvider | null = null;

/**
 * Devolve o provedor configurado.
 *
 * Preguiçoso e memoizado, no mesmo espírito de getResend() em
 * src/lib/email/client.ts: nenhuma variável de ambiente é lida no topo do
 * módulo, então `npm run build` passa numa máquina sem as chaves.
 *
 * WHATSAPP_PROVIDER = "evolution" (padrão) | "mock"
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;

  const escolhido = (process.env.WHATSAPP_PROVIDER ?? "evolution").toLowerCase();

  switch (escolhido) {
    case "mock":
      cached = createMockProvider();
      break;
    case "evolution":
      cached = createEvolutionProvider();
      break;
    default:
      throw new Error(
        `WHATSAPP_PROVIDER desconhecido: "${escolhido}". Use "evolution" ou "mock".`,
      );
  }

  return cached;
}
