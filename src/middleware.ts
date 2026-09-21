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
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/whatsapp|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
