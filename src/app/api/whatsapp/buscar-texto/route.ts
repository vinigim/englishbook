import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { waJidPhone, waPhoneKey } from "@/lib/leads/phone";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { carregarVinculosLid } from "@/lib/whatsapp/lid-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Procura um texto no histórico inteiro do WhatsApp e diz para onde cada
 * mensagem achada vai: qual telefone, por qual caminho, e qual lead.
 *
 * Existe porque uma conversa pode sumir sem aparecer em lugar nenhum: se o
 * LID dela for resolvido pelo cruzamento de NOME com o telefone errado (duas
 * empresas com o mesmo nome), ela não fica "não identificada" — cai quieta no
 * lead de outra pessoa. Só lê; não grava nada.
 */

const LIMITE_MS = 45_000;
const PAGINA = 200;
const MAX_ACHADOS = 20;

const bodySchema = z.object({ texto: z.string().trim().min(3).max(100) });

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

type Achado = {
  sentAt: string;
  fromMe: boolean;
  trecho: string;
  pushName: string | null;
  /** Telefone para onde a mensagem vai, ou null se nada resolve. */
  telefone: string | null;
  via: "telefone" | "alt" | "vinculo" | "nome" | null;
  lid: string | null;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: "Digite pelo menos 3 letras." },
      { status: 400 },
    );
  }
  const termo = normalizar(parsed.data.texto);

  const adminResult = tryCreateAdminClient();
  if (!adminResult.ok) {
    return NextResponse.json({ error: "admin_not_configured" }, { status: 500 });
  }

  try {
    const provider = getWhatsAppProvider();
    const achados: Achado[] = [];
    // A Evolution guarda a mesma mensagem duas vezes (cópia do histórico e
    // cópia ao vivo). Na busca, uma basta.
    const vistos = new Set<string>();
    const repetido = (sentAt: string, fromMe: boolean, texto: string) => {
      const chave = `${sentAt}|${fromMe}|${texto}`;
      if (vistos.has(chave)) return true;
      vistos.add(chave);
      return false;
    };
    const lidMapAlt: Record<string, string> = {};
    const inicio = Date.now();
    let paginas = 0;
    let chegouAoFim = false;

    for (let page = 1; Date.now() - inicio < LIMITE_MS; page++) {
      const lote = await provider.fetchMessagesPage({ page, pageSize: PAGINA });
      paginas += 1;
      Object.assign(lidMapAlt, lote.lidMap);

      for (const m of lote.mensagens) {
        const texto = m.body ?? m.caption;
        if (!texto || !normalizar(texto).includes(termo)) continue;
        if (achados.length >= MAX_ACHADOS) break;
        if (repetido(m.sentAt, m.direction === "out", texto)) continue;
        achados.push({
          sentAt: m.sentAt,
          fromMe: m.direction === "out",
          trecho: texto.slice(0, 160),
          pushName: m.pushName,
          telefone: m.phoneE164,
          via: m.chatId.includes("@lid") ? "alt" : "telefone",
          lid: m.chatId.includes("@lid") ? m.chatId.split("@")[0] : null,
        });
      }
      for (const p of lote.pendentes) {
        const texto = p.resumo.texto;
        if (!texto || !normalizar(texto).includes(termo)) continue;
        if (achados.length >= MAX_ACHADOS) break;
        if (repetido(p.resumo.sentAt, p.resumo.fromMe, texto)) continue;
        achados.push({
          sentAt: p.resumo.sentAt,
          fromMe: p.resumo.fromMe,
          trecho: texto.slice(0, 160),
          pushName: p.resumo.pushName,
          telefone: null,
          via: null,
          lid: p.lid,
        });
      }

      if (lote.brutas < PAGINA) {
        chegouAoFim = true;
        break;
      }
    }

    // Resolve os LIDs na mesma ordem da sincronização: alt, vínculo, nome.
    const manuais = await carregarVinculosLid(adminResult.admin);
    const porNome = provider.fetchLidMap
      ? await provider
          .fetchLidMap()
          .then((r) => r.map)
          .catch(() => ({}) as Record<string, string>)
      : ({} as Record<string, string>);

    for (const a of achados) {
      if (a.telefone || !a.lid) continue;
      if (lidMapAlt[a.lid]) {
        a.telefone = lidMapAlt[a.lid];
        a.via = "alt";
      } else if (manuais[a.lid]) {
        a.telefone = manuais[a.lid];
        a.via = "vinculo";
      } else if (porNome[a.lid]) {
        a.telefone = porNome[a.lid];
        a.via = "nome";
      }
    }

    // Qual lead tem cada telefone — pela mesma chave que o ingest usa.
    const chaveDe = (tel: string) => {
      const e164 = waJidPhone(tel);
      return e164 ? waPhoneKey(e164) : null;
    };
    const chaves = Array.from(
      new Set(achados.map((a) => (a.telefone ? chaveDe(a.telefone) : null)).filter(Boolean)),
    ) as string[];
    const leadPorChave = new Map<string, { id: string; nome: string }>();
    if (chaves.length > 0) {
      const { data } = await supabase
        .from("wa_leads")
        .select("id, phone_key, display_name, sheet_name, clinic_name")
        .in("phone_key", chaves);
      for (const l of (data ?? []) as {
        id: string;
        phone_key: string;
        display_name: string | null;
        sheet_name: string | null;
        clinic_name: string | null;
      }[]) {
        leadPorChave.set(l.phone_key, {
          id: l.id,
          nome: l.display_name || l.sheet_name || l.clinic_name || l.phone_key,
        });
      }
    }

    return NextResponse.json({
      paginas,
      chegouAoFim,
      achados: achados.map((a) => {
        const chave = a.telefone ? chaveDe(a.telefone) : null;
        return { ...a, lead: chave ? (leadPorChave.get(chave) ?? null) : null };
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[wa-buscar-texto]", msg);
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}
