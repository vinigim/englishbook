import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Webhooks ficam de fora: eles se autenticam sozinhos (assinatura do
    // Stripe, segredo compartilhado do WhatsApp) e não têm sessão de usuário.
    // Passar por aqui só acrescentaria uma chamada de rede a cada evento.
    // O mesmo vale para o link das janelas (/j/<codigo>), tocado por médicos
    // sem login. E a rota do óculos (/api/oculos/<codigo>), que se autentica
    // pelo código e é chamada pelo app do óculos, sem cookie.
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/whatsapp|api/oculos|j/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
