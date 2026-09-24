import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { buscarInstagram } from "@/lib/ai/buscar-instagram";
import { extraFields, formatPhoneBR } from "@/app/derma-lux/leads-shared";
import type { Lead } from "@/app/derma-lux/leads-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Buscar Instagram com IA", na ficha do lead.
 *
 * Só devolve candidatos; não grava nada. Salvar é outro toque, na action
 * `definirInstagram`, depois de o dono conferir o perfil.
 *
 * Route Handler e não Server Action porque a pesquisa na web leva dezenas de
 * segundos, e aqui o tempo máximo fica explícito.
 */

const idSchema = z.string().uuid();

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "ai_not_configured", message: "ANTHROPIC_API_KEY não está configurada." },
      { status: 500 },
    );
  }

  // Cliente do usuário: a RLS (lux_staff) decide se ele pode ver o lead.
  const { data, error } = await supabase
    .from("wa_leads")
    .select("sheet_name, display_name, clinic_name, specialty, city, uf, phone_e164, extra")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[buscar-instagram] falha ao ler lead:", error.message);
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const lead = data as Pick<
    Lead,
    "sheet_name" | "display_name" | "clinic_name" | "specialty" | "city" | "uf" | "phone_e164" | "extra"
  >;

  // Nome só com letra: o display_name às vezes é o próprio LID do WhatsApp.
  const nomes = [lead.sheet_name, lead.display_name]
    .map((n) => n?.trim())
    .filter((n): n is string => Boolean(n && /\p{L}/u.test(n)));
  const unicos = [...new Set(nomes)];

  // Coluna extra só se for curta: observação longa pode ter anotação sobre
  // paciente, e não há motivo para ela ir para a pesquisa.
  //
  // Coluna de Instagram também fica de fora: se o lead chegou aqui, o que ela
  // tem não é perfil ("Não encontrado"), e isso induzia a IA a desistir.
  const extras = extraFields(lead.extra)
    .filter(([k, v]) => v.length <= 80 && !/instagram|insta|^ig$/i.test(k))
    .slice(0, 6);

  try {
    const resultado = await buscarInstagram({
      nomes: unicos,
      clinica: lead.clinic_name,
      especialidade: lead.specialty,
      cidade: lead.city,
      uf: lead.uf,
      telefone: lead.phone_e164 ? formatPhoneBR(lead.phone_e164) : null,
      extras,
    });
    console.log(
      `[buscar-instagram] lead ${id}: ${resultado.candidatos.length} candidato(s), ${resultado.pesquisas} pesquisa(s), US$ ${resultado.custoUsd}`,
    );
    return NextResponse.json(resultado);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha na busca.";
    console.error("[buscar-instagram] falha:", message);
    // Pesquisa desligada na organização da Anthropic é o erro provável no
    // primeiro uso, e só o dono resolve — no console, não aqui.
    const desligada = /web.?search|not enabled|not allowed|permission/i.test(message);
    return NextResponse.json(
      {
        error: "search_failed",
        message: desligada
          ? "A pesquisa na web parece desligada na sua conta da Anthropic. Ative em console.anthropic.com (configurações da organização) e tente de novo."
          : `A busca falhou: ${message}`,
      },
      { status: 502 },
    );
  }
}
