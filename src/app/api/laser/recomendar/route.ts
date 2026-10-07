import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { recomendarParametros } from "@/lib/laser/recomendar";
import { entradaSchema } from "@/lib/laser/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uma consulta com o Opus em esforço alto leva de 20 s a pouco mais de 1 min.
export const maxDuration = 300;

/**
 * Recomenda parâmetros do SmartXide Punto para um caso.
 *
 * Route Handler, e não Server Action, para poder declarar o `maxDuration`
 * acima: a chamada à IA passa com folga do tempo padrão de uma função.
 */
const bodySchema = z.object({
  entrada: entradaSchema,
  /** Ignora a consulta gravada e pergunta à IA de novo. */
  forcar: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // O projeto do Supabase é compartilhado com contas antigas do EnglishBook.
  // Sem esta checagem, qualquer uma delas gastaria a chave da Anthropic.
  // A policy lux_staff_self_read deixa cada pessoa ler só a própria linha.
  const { data: staff } = await supabase
    .from("lux_staff")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!staff) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error: "ai_not_configured",
        message: "Configure ANTHROPIC_API_KEY para gerar recomendações.",
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
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

  const resultado = await recomendarParametros(supabase, parsed.data.entrada, {
    forcar: parsed.data.forcar,
  });

  if (!resultado.ok) {
    const status = resultado.error === "rate_limited" ? 429 : 502;
    return NextResponse.json(
      { error: resultado.error, message: resultado.message },
      { status },
    );
  }

  return NextResponse.json(resultado.resposta);
}
