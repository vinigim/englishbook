import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Só renova o cookie da sessão; quem protege as páginas é o layout de (app).
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron).*)"],
};
