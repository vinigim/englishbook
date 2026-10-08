import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lerConsulta } from "@/lib/laser/consultas";
import { realizadoSchema } from "@/lib/laser/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Atualiza uma consulta já feita: a locação ligada e/ou os parâmetros que o
 * médico de fato usou. Não chama a IA.
 *
 * Campo ausente no corpo = não mexe; `null` = apaga.
 */
const bodySchema = z
  .object({
    rentalId: z.string().uuid().nullable().optional(),
    realizado: realizadoSchema.nullable().optional(),
  })
  .refine((b) => b.rentalId !== undefined || b.realizado !== undefined, {
    message: "Nada para atualizar.",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const mudancas: Record<string, unknown> = {};
  if (parsed.data.rentalId !== undefined) mudancas.rental_id = parsed.data.rentalId;
  if (parsed.data.realizado !== undefined) {
    mudancas.parametros_realizados = parsed.data.realizado
      ? { ...parsed.data.realizado, registradoEm: new Date().toISOString() }
      : null;
  }

  // Pelo cliente do usuário: a RLS (lux_staff) decide se ele pode editar.
  const { data, error } = await supabase
    .from("laser_consultas")
    .update(mudancas)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[laser-consulta] falha ao atualizar", error.message);
    const faltaMigracao = /rental_id|parametros_realizados/.test(error.message);
    return NextResponse.json(
      {
        error: faltaMigracao ? "migration_missing" : "db_error",
        message: faltaMigracao
          ? "Rode a migração 0022_laser_consulta_locacao.sql no Supabase."
          : undefined,
      },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const consulta = await lerConsulta(supabase, id);
  return NextResponse.json({ consulta });
}
