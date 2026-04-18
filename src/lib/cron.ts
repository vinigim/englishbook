import { NextResponse, type NextRequest } from "next/server";

/**
 * Vercel Cron envia header "Authorization: Bearer <CRON_SECRET>"
 * automaticamente quando você configura a env CRON_SECRET.
 *
 * Referência: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 *
 * Retorna NextResponse 401 se a auth falhar, null caso contrário.
 */
export function validateCronRequest(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Sem secret configurado, rejeita tudo em produção
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "cron_secret_not_configured" },
        { status: 500 }
      );
    }
    // Em dev, permite chamadas sem auth (facilita teste com curl)
    return null;
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
