import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { parseSpreadsheet } from "@/lib/leads/spreadsheet";
import { looksLikeCompanyName } from "@/lib/leads/columns";
import { toInstagramHandle } from "@/lib/leads/instagram";
import { toLeadPhone } from "@/lib/leads/phone";
import type {
  ColumnMapping,
  ColumnRole,
  ContactRow,
  ImportReport,
} from "@/lib/leads/sheet-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Rota (e não Server Action) porque next.config.mjs limita o corpo das Server
// Actions a 2 MB, e planilha de carteira de clientes passa disso fácil.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const BATCH_SIZE = 500;

/** Só quem está logado importa. A escrita depois usa a service role. */
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const step = request.nextUrl.searchParams.get("step") ?? "parse";

  if (step === "parse") return handleParse(request);
  if (step === "commit") return handleCommit(request);

  return NextResponse.json({ error: "invalid_step" }, { status: 400 });
}

// ============================================================================
//  Passo 1 — ler a planilha e devolver o preview das colunas detectadas
// ============================================================================
async function handleParse(request: NextRequest) {
  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", message: "A planilha passa de 10 MB." },
      { status: 400 },
    );
  }

  try {
    const result = parseSpreadsheet(await file.arrayBuffer());
    if (result.totalRows === 0) {
      return NextResponse.json(
        { error: "empty_sheet", message: "A planilha não tem linhas com dados." },
        { status: 400 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[leads-import] parse error:", err);
    return NextResponse.json(
      { error: "parse_failed", message: "Não consegui ler este arquivo." },
      { status: 400 },
    );
  }
}

// ============================================================================
//  Passo 2 — gravar os leads
// ============================================================================
const ROLES: [ColumnRole, ...ColumnRole[]] = [
  "name",
  "phone",
  "company",
  "email",
  "specialty",
  "city",
  "instagram",
  "custom",
];

const commitSchema = z.object({
  rows: z.array(z.record(z.string())).min(1, "Nenhuma linha para importar"),
  mapping: z.record(z.enum(ROLES)),
});

type ExistingLead = {
  id: string;
  phone_key: string;
  display_name: string | null;
  sheet_name: string | null;
  clinic_name: string | null;
  specialty: string | null;
  city: string | null;
  instagram: string | null;
  source: string;
  extra: Record<string, unknown> | null;
};

async function handleCommit(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { rows, mapping } = parsed.data;

  // Inverte o mapa: papel -> cabeçalhos que têm esse papel.
  const byRole = new Map<ColumnRole, string[]>();
  for (const [header, role] of Object.entries(mapping) as [
    string,
    ColumnRole,
  ][]) {
    byRole.set(role, [...(byRole.get(role) ?? []), header]);
  }

  const phoneHeaders = byRole.get("phone") ?? [];
  if (phoneHeaders.length === 0) {
    return NextResponse.json(
      {
        error: "missing_phone_column",
        message: "Escolha qual coluna tem o telefone.",
      },
      { status: 400 },
    );
  }

  const report: ImportReport = { criados: 0, atualizados: 0, invalidos: [] };

  // 1) Normaliza e valida todas as linhas antes de tocar no banco.
  type Candidate = {
    phoneKey: string;
    phoneE164: string;
    name: string | null;
    company: string | null;
    specialty: string | null;
    city: string | null;
    email: string | null;
    instagram: string | null;
    extra: Record<string, string>;
  };

  const candidates = new Map<string, Candidate>();

  rows.forEach((row: ContactRow, i) => {
    const rawPhone = firstValue(row, phoneHeaders);
    if (!rawPhone) {
      report.invalidos.push({
        linha: i + 2, // +1 do cabeçalho, +1 porque planilha começa em 1
        telefone: "",
        motivo: "Sem telefone",
      });
      return;
    }

    const phone = toLeadPhone(rawPhone);
    if (!phone) {
      report.invalidos.push({
        linha: i + 2,
        telefone: rawPhone,
        motivo: "Telefone inválido",
      });
      return;
    }

    const extra: Record<string, string> = {};
    for (const header of byRole.get("custom") ?? []) {
      const v = row[header];
      if (v) extra[header] = v;
    }

    // O Instagram é guardado só como handle, para o link do direct sempre
    // montar. O que não dá para afirmar que é um perfil — "não tem", um link
    // de outro site — volta para `extra` em vez de sumir: dado estranho à
    // vista é melhor do que dado descartado em silêncio.
    const instagramHeaders = byRole.get("instagram") ?? [];
    const instagramHeader = instagramHeaders.find((h) => row[h]?.trim());
    const instagramBruto = instagramHeader
      ? row[instagramHeader].trim()
      : null;
    const instagram = toInstagramHandle(instagramBruto);
    if (instagramHeader && instagramBruto && !instagram) {
      extra[instagramHeader] = instagramBruto;
    }

    const candidate: Candidate = {
      phoneKey: phone.phoneKey,
      phoneE164: phone.phoneE164,
      name: firstValue(row, byRole.get("name") ?? []),
      company: firstValue(row, byRole.get("company") ?? []),
      specialty: firstValue(row, byRole.get("specialty") ?? []),
      city: firstValue(row, byRole.get("city") ?? []),
      email: firstValue(row, byRole.get("email") ?? []),
      instagram,
      extra,
    };

    // Linha duplicada dentro da própria planilha: a última vence.
    candidates.set(candidate.phoneKey, candidate);
  });

  if (candidates.size === 0) {
    return NextResponse.json(report);
  }

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    console.error("[leads-import] SUPABASE_SERVICE_ROLE_KEY ausente");
    return NextResponse.json(
      { error: "admin_not_configured", message: adminResult.message },
      { status: 500 },
    );
  }
  const admin = adminResult.admin;
  const keys = [...candidates.keys()];

  // 2) Busca o que já existe, para fazer o merge sem sobrescrever.
  const existing = new Map<string, ExistingLead>();
  for (const chunk of chunked(keys, BATCH_SIZE)) {
    const { data, error } = await admin
      .from("wa_leads")
      .select(
        "id, phone_key, display_name, sheet_name, clinic_name, specialty, city, instagram, source, extra",
      )
      .in("phone_key", chunk);

    if (error) {
      console.error("[leads-import] select error:", error);
      return NextResponse.json({ error: "import_failed" }, { status: 500 });
    }
    for (const row of (data ?? []) as ExistingLead[]) {
      existing.set(row.phone_key, row);
    }
  }

  // 3) Monta o payload final.
  //
  // Regra do merge: a planilha NUNCA sobrescreve o que veio da conversa. O nome
  // da planilha vai para `sheet_name`, não por cima de `display_name`; os
  // demais campos só são preenchidos quando estão nulos no banco. Colunas
  // extras entram inteiras em `extra`, sem perder dado.
  const payload = [...candidates.values()].map((c) => {
    const prev = existing.get(c.phoneKey);
    const nome = c.name ?? c.company;

    return {
      phone_key: c.phoneKey,
      phone_e164: prev ? undefined : c.phoneE164,
      sheet_name: prev?.sheet_name ?? nome ?? null,
      clinic_name: prev?.clinic_name ?? c.company ?? null,
      specialty: prev?.specialty ?? c.specialty ?? null,
      city: prev?.city ?? c.city ?? null,
      // Único campo em que a planilha MANDA, e de propósito: ela é a única
      // fonte de Instagram que existe — o WhatsApp não informa isso. Corrigir
      // um handle errado na planilha tem que corrigir no painel também. Se a
      // coluna vier vazia, o que já estava gravado é preservado.
      instagram: c.instagram ?? prev?.instagram ?? null,
      lead_kind:
        nome && looksLikeCompanyName(nome) ? "clinica" : "desconhecido",
      source: prev
        ? prev.source === "planilha"
          ? "planilha"
          : "ambos"
        : "planilha",
      extra: {
        ...(prev?.extra ?? {}),
        ...c.extra,
        ...(c.email ? { email: c.email } : {}),
      },
      // Lead novo já nasce querendo análise; lead existente não é remarcado
      // só por ter sido enriquecido pela planilha.
      ...(prev ? {} : { first_seen_at: new Date().toISOString() }),
    };
  });

  // `phone_e164` é NOT NULL: para leads novos vai o valor; para existentes
  // omitimos o campo do payload (undefined some no JSON) e o banco preserva
  // o que já estava lá.
  const cleaned = payload.map((p) =>
    Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)),
  );

  for (const chunk of chunked(cleaned, BATCH_SIZE)) {
    const { error } = await admin
      .from("wa_leads")
      .upsert(chunk, { onConflict: "phone_key" });

    if (error) {
      console.error("[leads-import] upsert error:", error);
      return NextResponse.json(
        { error: "import_failed", message: error.message },
        { status: 500 },
      );
    }
  }

  report.criados = keys.filter((k) => !existing.has(k)).length;
  report.atualizados = keys.filter((k) => existing.has(k)).length;

  return NextResponse.json(report);
}

// ============================================================================
//  Utilidades
// ============================================================================
function firstValue(row: ContactRow, headers: string[]): string | null {
  for (const h of headers) {
    const v = row[h]?.trim();
    if (v) return v;
  }
  return null;
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
