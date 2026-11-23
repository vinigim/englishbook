import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { parseSpreadsheet } from "@/lib/leads/spreadsheet";
import { looksLikeCompanyName } from "@/lib/leads/columns";
import { toInstagramHandle } from "@/lib/leads/instagram";
import { toLeadPhone } from "@/lib/leads/phone";
import { linkDoPerfil, trocarTelefone } from "@/lib/leads/troca-telefone";
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
  "previous_phone",
  "profile_url",
  "crm",
  "rqe",
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
  /** Preenchido = o dono escolheu o @ na ficha, e a planilha não o troca. */
  instagram_escolhido_em?: string | null;
  source: string;
  extra: Record<string, unknown> | null;
  // Estes dois não são usados no merge: são lidos só para poderem ser
  // reenviados iguais. Ver o aviso sobre lote misto na montagem do payload.
  phone_e164: string;
  first_seen_at: string | null;
  // Só lidos quando a planilha traz perfil, CRM ou RQE (0031).
  perfil_url?: string | null;
  crm?: string | null;
  rqe?: string | null;
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

  const report: ImportReport = {
    criados: 0,
    atualizados: 0,
    telefonesTrocados: 0,
    avisos: [],
    invalidos: [],
  };

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
    /** Chave do número que o lead usava antes (coluna "Telefone anterior"). */
    prevKey: string | null;
    perfil: string | null;
    crm: string | null;
    rqe: string | null;
    linha: number;
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
    // montar.
    //
    // Mais de uma coluna pode ter o papel — uma planilha real trouxe
    // "Site/Instagram", da época em que os dois iam no mesmo campo, e
    // "Instagram" depois. Por isso vence o primeiro valor que VIRA um perfil,
    // e não o primeiro cabeçalho que tem qualquer coisa escrita: senão um site
    // na coluna antiga cala o perfil que está na nova.
    //
    // O que não vira perfil — um site, um "Não encontrado" — volta para
    // `extra`, porque endereço de clínica é canal de contato, não lixo. Só o
    // que repete um handle já escolhido é descartado.
    const instagramHeaders = byRole.get("instagram") ?? [];
    let instagram: string | null = null;
    for (const header of instagramHeaders) {
      const bruto = row[header]?.trim();
      if (!bruto) continue;

      const handle = toInstagramHandle(bruto);
      if (handle) {
        instagram ??= handle;
      } else {
        extra[header] = bruto;
      }
    }

    // "Telefone anterior": a linha é o MESMO lead com número novo. Número
    // velho ilegível não impede a linha — só fica guardado como extra.
    let prevKey: string | null = null;
    for (const header of byRole.get("previous_phone") ?? []) {
      const bruto = row[header]?.trim();
      if (!bruto) continue;
      const anterior = toLeadPhone(bruto);
      if (anterior && !prevKey) prevKey = anterior.phoneKey;
      else if (!anterior) extra[header] = bruto;
    }

    // Link do perfil só se for http(s); o resto (um "não achei") vai para extra.
    let perfil: string | null = null;
    for (const header of byRole.get("profile_url") ?? []) {
      const bruto = row[header]?.trim();
      if (!bruto) continue;
      const link = linkDoPerfil(bruto);
      if (link && !perfil) perfil = link;
      else if (!link) extra[header] = bruto;
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
      prevKey: prevKey && prevKey !== phone.phoneKey ? prevKey : null,
      perfil,
      crm: firstValue(row, byRole.get("crm") ?? []),
      rqe: firstValue(row, byRole.get("rqe") ?? []),
      linha: i + 2,
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

  // 2a) Trocas de telefone ANTES de ler o que existe: o lead que estava no
  // número velho passa a estar no novo, e o merge abaixo o encontra lá —
  // conversa, análises e locações seguem com ele. Rodar a mesma planilha de
  // novo não faz nada: o número velho já não é de ninguém como atual.
  const trocas = [...candidates.values()].filter((c) => c.prevKey);
  if (trocas.length > 0) {
    const { data: antigos, error } = await admin
      .from("wa_leads")
      .select("id, phone_key, telefones_anteriores")
      .in("phone_key", trocas.map((c) => c.prevKey as string));
    if (error) {
      console.error("[leads-import] select anteriores:", error);
      return NextResponse.json(
        {
          error: "import_failed",
          message: /telefones_anteriores/.test(error.message)
            ? "Falta rodar a migração 0031 no Supabase."
            : error.message,
        },
        { status: 500 },
      );
    }
    const porChave = new Map(
      ((antigos ?? []) as { id: string; phone_key: string; telefones_anteriores: string[] | null }[])
        .map((l) => [l.phone_key, l]),
    );
    for (const c of trocas) {
      const lead = porChave.get(c.prevKey as string);
      if (!lead) continue;
      const r = await trocarTelefone(admin, lead, {
        phoneKey: c.phoneKey,
        phoneE164: c.phoneE164,
      });
      if (r.ok) {
        report.telefonesTrocados += 1;
        porChave.delete(c.prevKey as string);
      } else if (r.motivo === "numero_de_outro_lead") {
        report.avisos.push({
          linha: c.linha,
          motivo: `o número novo já é do lead "${r.outro.nome}"; o lead do número anterior ficou como estava`,
        });
      } else if (r.motivo === "erro") {
        report.avisos.push({ linha: c.linha, motivo: r.mensagem });
      }
    }
  }

  // Perfil, CRM e RQE entram no upsert só quando a planilha traz algum: as
  // colunas são da 0031, e planilha comum não pode quebrar sem ela.
  const comPerfil = [...candidates.values()].some((c) => c.perfil || c.crm || c.rqe);

  // 2) Busca o que já existe, para fazer o merge sem sobrescrever.
  const existing = new Map<string, ExistingLead>();
  const COLUNAS =
    "id, phone_key, display_name, sheet_name, clinic_name, specialty, city, instagram, source, extra, phone_e164, first_seen_at" +
    (comPerfil ? ", perfil_url, crm, rqe" : "");
  // Sem a migração 0019 a coluna não existe; a importação não pode parar por
  // isso — segue sem ela, com a regra antiga (a planilha manda no @).
  let comEscolha = true;
  for (const chunk of chunked(keys, BATCH_SIZE)) {
    const ler = (colunas: string) =>
      admin.from("wa_leads").select(colunas).in("phone_key", chunk);
    let { data, error } = await ler(
      comEscolha ? `${COLUNAS}, instagram_escolhido_em` : COLUNAS,
    );
    if (error && comEscolha && /instagram_escolhido_em/.test(error.message)) {
      comEscolha = false;
      ({ data, error } = await ler(COLUNAS));
    }

    if (error) {
      console.error("[leads-import] select error:", error);
      return NextResponse.json(
        {
          error: "import_failed",
          message: /perfil_url|crm|rqe/.test(error.message)
            ? "Falta rodar a migração 0031 no Supabase."
            : undefined,
        },
        { status: 500 },
      );
    }
    for (const row of (data ?? []) as unknown as ExistingLead[]) {
      existing.set(row.phone_key, row);
    }
  }

  // 3) Monta o payload final.
  //
  // Regra do merge: a planilha NUNCA sobrescreve o que veio da conversa. O nome
  // da planilha vai para `sheet_name`, não por cima de `display_name`; os
  // demais campos só são preenchidos quando estão nulos no banco. Colunas
  // extras entram inteiras em `extra`, sem perder dado.
  //
  // ⚠️ TODA linha deste array precisa ter EXATAMENTE o mesmo conjunto de
  // chaves. Omitir um campo NÃO preserva o valor que está no banco — de dois
  // jeitos diferentes, dependendo de quantos objetos o omitem:
  //
  //   - omitido por TODOS: a coluna simplesmente não entra no INSERT, a tupla
  //     assume o default dela (NULL), e o `not null` dispara na inserção
  //     especulativa, antes de o ON CONFLICT DO UPDATE ser considerado;
  //   - omitido por ALGUNS: o PostgREST monta o INSERT com a UNIÃO das colunas
  //     de todos os objetos, e quem não trouxe a chave recebe NULL explícito.
  //     Foi assim que o `needs_analysis` quebrou uma vez.
  //
  // Foi o primeiro caso que derrubou a importação da planilha de prospecção:
  // os 379 leads já existiam todos, nenhum objeto trazia `phone_e164`, e a
  // coluna sumiu do INSERT. Ou seja, a omissão nunca preservou nada — só não
  // tinha estourado antes porque as importações anteriores traziam leads
  // novos, e eram eles que colocavam a coluna no INSERT para os antigos
  // pegarem carona.
  //
  // O `first_seen_at` tinha o mesmo defeito sem estourar, porque é nulável:
  // apagava em silêncio a data de primeiro contato.
  //
  // Por isso preservar é RELER e reenviar igual, nunca omitir.
  const payload = [...candidates.values()].map((c) => {
    const prev = existing.get(c.phoneKey);
    const nome = c.name ?? c.company;

    return {
      phone_key: c.phoneKey,
      phone_e164: prev?.phone_e164 ?? c.phoneE164,
      sheet_name: prev?.sheet_name ?? nome ?? null,
      clinic_name: prev?.clinic_name ?? c.company ?? null,
      specialty: prev?.specialty ?? c.specialty ?? null,
      city: prev?.city ?? c.city ?? null,
      // Aqui a planilha MANDA: corrigir um handle errado nela tem que
      // corrigir no painel também. Se a coluna vier vazia, o que já estava
      // gravado é preservado.
      //
      // Exceção: o @ que o dono escolheu na ficha (busca com IA ou colado),
      // marcado em instagram_escolhido_em. Ele conferiu o perfil na tela, e
      // decidiu que essa escolha vale mais que a planilha.
      instagram: prev?.instagram_escolhido_em
        ? prev.instagram
        : (c.instagram ?? prev?.instagram ?? null),
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
      // `prev ? prev.x : agora` e não `??`: lead antigo cuja data é nula
      // continua nula, em vez de ganhar a de hoje e parecer recém-conhecido.
      first_seen_at: prev ? prev.first_seen_at : new Date().toISOString(),
      // Mesma regra de chaves iguais em todas as linhas (ver o aviso acima):
      // ou todas trazem as três, ou nenhuma. O da planilha vence, vazio preserva.
      ...(comPerfil
        ? {
            perfil_url: c.perfil ?? prev?.perfil_url ?? null,
            crm: c.crm ?? prev?.crm ?? null,
            rqe: c.rqe ?? prev?.rqe ?? null,
          }
        : {}),
    };
  });

  for (const chunk of chunked(payload, BATCH_SIZE)) {
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
