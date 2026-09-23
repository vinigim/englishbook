import { timingSafeEqual } from "node:crypto";
import {
  isGroupJid,
  isLidJid,
  jidToPhone,
  type DiagnosticoTelefone,
  type LidMapResult,
  type MessagePage,
  type PendingLidMessage,
  toIsoDate,
  type NormalizedMessage,
  type WaChat,
  type WaConnection,
  type WaMessageType,
  type WebhookRequest,
  type WhatsAppProvider,
} from "./provider";

/**
 * Adaptador da Evolution API (self-hosted, conexão por QR Code).
 *
 * A Evolution roda num servidor sempre ligado (a Vercel é serverless e não
 * sustenta o socket do WhatsApp), e o app fala com ela por REST.
 *
 * Documentação dos endpoints muda entre versões; o que este arquivo usa:
 *   POST /message/sendText/{instance}
 *   POST /chat/findMessages/{instance}
 *   POST /chat/findChats/{instance}
 *   GET  /instance/connectionState/{instance}
 */

type EvolutionConfig = {
  baseUrl: string;
  apiKey: string;
  instance: string;
  webhookSecret: string;
};

function readConfig(): EvolutionConfig {
  const baseUrl = process.env.EVOLUTION_API_URL ?? "";
  const apiKey = process.env.EVOLUTION_API_KEY ?? "";
  const instance = process.env.EVOLUTION_INSTANCE ?? "";
  const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";

  if (!baseUrl || !apiKey || !instance) {
    throw new Error(
      "Evolution API não configurada: faltam EVOLUTION_API_URL, EVOLUTION_API_KEY ou EVOLUTION_INSTANCE.",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    instance,
    webhookSecret,
  };
}

/** Comparação em tempo constante, tolerante a tamanhos diferentes. */
function secretsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ============================================================================
//  Extração do conteúdo (o formato do Baileys, que a Evolution repassa)
// ============================================================================

type EvolutionMessageContent = Record<string, unknown> | null | undefined;

type Extracted = {
  type: WaMessageType;
  body: string | null;
  caption: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function obj(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function extractContent(message: EvolutionMessageContent): Extracted {
  const empty: Extracted = {
    type: "other",
    body: null,
    caption: null,
    mediaUrl: null,
    mediaMime: null,
  };
  if (!message) return empty;

  // Mensagens encaminhadas/efêmeras vêm embrulhadas numa camada extra.
  const unwrapped =
    obj(obj(message.ephemeralMessage)?.message) ??
    obj(obj(message.viewOnceMessage)?.message) ??
    obj(obj(message.viewOnceMessageV2)?.message) ??
    message;

  const conversation = str(unwrapped.conversation);
  if (conversation) {
    return { ...empty, type: "text", body: conversation };
  }

  const extended = obj(unwrapped.extendedTextMessage);
  if (extended) {
    return { ...empty, type: "text", body: str(extended.text) };
  }

  const media: [string, WaMessageType][] = [
    ["imageMessage", "image"],
    ["audioMessage", "audio"],
    ["videoMessage", "video"],
    ["documentMessage", "document"],
    ["stickerMessage", "sticker"],
  ];

  for (const [key, type] of media) {
    const node = obj(unwrapped[key]);
    if (!node) continue;
    return {
      type,
      // Para documento, o nome do arquivo é a informação útil.
      body: type === "document" ? str(node.fileName) : null,
      caption: str(node.caption),
      mediaUrl: str(node.url) ?? str(node.directPath),
      mediaMime: str(node.mimetype),
    };
  }

  const location = obj(unwrapped.locationMessage);
  if (location) {
    const name = str(location.name) ?? str(location.address);
    return { ...empty, type: "location", body: name };
  }

  const contact =
    obj(unwrapped.contactMessage) ?? obj(unwrapped.contactsArrayMessage);
  if (contact) {
    return { ...empty, type: "contact", body: str(contact.displayName) };
  }

  // Reação fica como "other" com o emoji em body: é o único "other" com texto,
  // e é assim que `ehReacao()` a reconhece na tela e na transcrição da IA.
  const reaction = obj(unwrapped.reactionMessage);
  if (reaction) {
    return { ...empty, type: "other", body: str(reaction.text) };
  }

  return empty;
}

/**
 * Mensagem que só tem LID, guardada para ser resolvida depois.
 *
 * Devolve `null` para o que não é LID: aí o descarte é definitivo.
 */
export function pendenteDeLid(raw: EvolutionRawMessage): PendingLidMessage | null {
  const remoteJid = raw?.key?.remoteJid;
  if (!raw?.key?.id || !remoteJid || !isLidJid(remoteJid)) return null;
  const lid = jidToPhone(remoteJid);
  if (!lid) return null;

  const conteudo = extractContent(raw.message);
  return {
    lid,
    resolver: (phoneE164) => normalizeComTelefone(raw, phoneE164),
    resumo: {
      sentAt: toIsoDate(raw.messageTimestamp),
      fromMe: Boolean(raw.key.fromMe),
      texto: conteudo.body ?? conteudo.caption,
      pushName: str(raw.pushName),
    },
  };
}

export type EvolutionRawMessage = {
  key?: {
    id?: string;
    remoteJid?: string;
    /**
     * O JID alternativo. Quando `remoteJid` é um LID, é aqui que vem o JID de
     * telefone de verdade — e vice-versa. A própria Evolution faz essa troca
     * ao receber mensagem nova (whatsapp.baileys.service.ts), mas NÃO nos
     * registros de chat gravados pela sincronização de histórico, que é de
     * onde o backfill lê.
     */
    remoteJidAlt?: string;
    fromMe?: boolean;
  };
  pushName?: string;
  message?: EvolutionMessageContent;
  messageTimestamp?: number | string;
  messageType?: string;
};

/**
 * Qual JID identifica o interlocutor.
 *
 * Devolve `null` quando só há LID: melhor não ter lead do que ter um lead com
 * identidade inventada, que nunca se funde com o contato certo.
 */
export function jidDeIdentidade(key: {
  remoteJid?: string;
  remoteJidAlt?: string;
}): string | null {
  const { remoteJid, remoteJidAlt } = key;
  if (!remoteJid) return null;
  if (!isLidJid(remoteJid)) return remoteJid;
  if (remoteJidAlt && !isLidJid(remoteJidAlt)) return remoteJidAlt;
  return null;
}

/**
 * Exportada para que o adaptador de fixtures use exatamente o mesmo parser.
 * Assim, testar com fixture testa o código que roda em produção.
 */
export function normalizeOne(
  raw: EvolutionRawMessage,
): NormalizedMessage | null {
  const id = raw?.key?.id;
  const remoteJid = raw?.key?.remoteJid;
  if (!id || !remoteJid) return null;

  // O chat continua sendo endereçado pelo `remoteJid` original — é por ele que
  // findMessages busca. Só a IDENTIDADE do lead precisa do telefone real.
  const jidIdentidade = jidDeIdentidade(raw.key ?? {});
  if (!jidIdentidade) return null;

  const phoneE164 = jidToPhone(jidIdentidade);
  if (!phoneE164) return null;

  const extracted = extractContent(raw.message);

  return {
    providerMessageId: id,
    chatId: remoteJid,
    phoneE164,
    direction: raw.key?.fromMe ? "out" : "in",
    type: extracted.type,
    body: extracted.body,
    caption: extracted.caption,
    mediaUrl: extracted.mediaUrl,
    mediaMime: extracted.mediaMime,
    pushName: str(raw.pushName),
    isGroup: isGroupJid(remoteJid),
    sentAt: toIsoDate(raw.messageTimestamp),
    raw,
  };
}

/**
 * Normaliza uma mensagem cujo telefone veio de fora — do mapa LID → telefone,
 * montado a partir de outras mensagens do mesmo LID.
 *
 * Idêntica a `normalizeOne` no resto: mesmo extrator de conteúdo, mesmos
 * campos. Só a identidade do interlocutor entra pronta, em vez de sair do JID.
 *
 * Quem chama garante que `raw.key.id` e `raw.key.remoteJid` existem — sem eles
 * a mensagem nem chega a virar pendente.
 */
export function normalizeComTelefone(
  raw: EvolutionRawMessage,
  phoneE164: string,
): NormalizedMessage {
  const remoteJid = raw.key?.remoteJid ?? "";
  const extracted = extractContent(raw.message);

  return {
    providerMessageId: raw.key?.id ?? "",
    chatId: remoteJid,
    phoneE164,
    direction: raw.key?.fromMe ? "out" : "in",
    type: extracted.type,
    body: extracted.body,
    caption: extracted.caption,
    mediaUrl: extracted.mediaUrl,
    mediaMime: extracted.mediaMime,
    pushName: str(raw.pushName),
    isGroup: isGroupJid(remoteJid),
    sentAt: toIsoDate(raw.messageTimestamp),
    raw,
  };
}


/**
 * Quantos contatos em LID têm um homônimo EXATO entre os contatos com
 * telefone — e quantos desses cruzamentos são ambíguos.
 *
 * Existe para medir antes de agir. Ligar conversa a lead pelo nome é escrever
 * no CRM do dono, e errar significa colar a conversa de um médico na ficha de
 * outro. Só vale se o cruzamento for praticamente sempre 1-para-1.
 */
function cruzarPorNome(
  contatos: Record<string, unknown>[],
  limit: number,
): {
  map: Record<string, string>;
  lidComNome: number;
  casamentosUnicos: number;
  ambiguos: number;
  semPar: number;
  exemplos: { nome: string; lid: string; telefone: string }[];
  /** Os recusados, com os candidatos — é por aqui que se resolve na mão. */
  naoResolvidos: { nome: string | null; lid: string; motivo: string; candidatos: string[] }[];
} {
  const norm = (v: unknown) =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  const porNomeTelefone = new Map<string, string[]>();
  for (const c of contatos) {
    const jid = String(c.remoteJid ?? "");
    if (!jid.includes("@s.whatsapp.net")) continue;
    const n = norm(c.pushName);
    if (!n) continue;
    const atual = porNomeTelefone.get(n) ?? [];
    atual.push(jid);
    porNomeTelefone.set(n, atual);
  }

  let lidComNome = 0;
  let casamentosUnicos = 0;
  let ambiguos = 0;
  let semPar = 0;
  const exemplos: { nome: string; lid: string; telefone: string }[] = [];
  const map: Record<string, string> = {};
  const naoResolvidos: {
    nome: string | null;
    lid: string;
    motivo: string;
    candidatos: string[];
  }[] = [];

  for (const c of contatos) {
    const jid = String(c.remoteJid ?? "");
    if (!jid.includes("@lid")) continue;
    const n = norm(c.pushName);
    if (!n) {
      // Contato em LID sem nome: não há por onde cruzar.
      naoResolvidos.push({
        nome: null,
        lid: jid,
        motivo: "sem nome",
        candidatos: [],
      });
      continue;
    }
    lidComNome += 1;

    const candidatos = porNomeTelefone.get(n);
    if (!candidatos) {
      semPar += 1;
      naoResolvidos.push({
        nome: String(c.pushName),
        lid: jid,
        motivo: "sem homônimo com telefone",
        candidatos: [],
      });
    } else if (candidatos.length > 1) {
      ambiguos += 1;
      // O nome está em mais de um telefone. Recusamos de propósito, mas o
      // dono sabe qual é o certo — então mostramos os candidatos.
      naoResolvidos.push({
        nome: String(c.pushName),
        lid: jid,
        motivo: "nome em mais de um telefone",
        candidatos,
      });
    } else {
      casamentosUnicos += 1;
      const lidDigitos = jidToPhone(jid);
      const telefone = jidToPhone(candidatos[0]);
      if (lidDigitos && telefone) map[lidDigitos] = telefone;
      if (exemplos.length < limit) {
        exemplos.push({ nome: String(c.pushName), lid: jid, telefone: candidatos[0] });
      }
    }
  }

  return {
    map,
    lidComNome,
    casamentosUnicos,
    ambiguos,
    semPar,
    exemplos,
    naoResolvidos,
  };
}

/** O campo `data` pode vir como objeto único ou como array, conforme a versão. */
export function asArray(data: unknown): EvolutionRawMessage[] {
  if (Array.isArray(data)) return data as EvolutionRawMessage[];
  if (data && typeof data === "object") return [data as EvolutionRawMessage];
  return [];
}

// ============================================================================
//  Adaptador
// ============================================================================

export function createEvolutionProvider(): WhatsAppProvider {
  // A config é lida a cada chamada, não no topo do módulo: assim uma variável
  // de ambiente faltando não derruba o `npm run build`.
  async function call<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const cfg = readConfig();
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        apikey: cfg.apiKey,
        "content-type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });

    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      throw new Error(
        `Evolution API ${res.status} em ${path}: ${texto.slice(0, 300)}`,
      );
    }
    return (await res.json()) as T;
  }

  /**
   * Uma página de mensagens da instância, da mais recente para a mais antiga.
   *
   * `offset` é o TAMANHO DA PÁGINA na Evolution, não um deslocamento: o
   * handler faz `take: query.offset` e `skip: offset * (page - 1)`. E não
   * existe parâmetro `limit` — mandar um não dá erro, ele simplesmente cai no
   * padrão de 50 mensagens. Era o que limitava o backfill sem nenhum sinal.
   */
  async function buscarPagina(
    page: number,
    pageSize: number,
  ): Promise<MessagePage> {
    const cfg = readConfig();

    type Resposta =
      | EvolutionRawMessage[]
      | { messages?: { records?: EvolutionRawMessage[] } | EvolutionRawMessage[] };

    const data = await call<Resposta>(`/chat/findMessages/${cfg.instance}`, {
      method: "POST",
      body: { page, offset: pageSize },
    });

    let registros: EvolutionRawMessage[] = [];
    if (Array.isArray(data)) {
      registros = data;
    } else if (Array.isArray(data.messages)) {
      registros = data.messages;
    } else if (data.messages?.records) {
      registros = data.messages.records;
    }

    const mensagens: NormalizedMessage[] = [];
    const pendentes: PendingLidMessage[] = [];
    const lidMap: Record<string, string> = {};
    let descartadasOutras = 0;

    for (const raw of registros) {
      const remoteJid = raw?.key?.remoteJid;
      if (!raw?.key?.id || !remoteJid) {
        descartadasOutras += 1;
        continue;
      }

      const m = normalizeOne(raw);
      if (m) {
        mensagens.push(m);
        // Esta chave sabia o telefone. Se o endereçamento é por LID, o par
        // vale para TODAS as outras mensagens do mesmo LID que vierem cruas.
        if (isLidJid(remoteJid)) {
          const lid = jidToPhone(remoteJid);
          if (lid && !lidMap[lid]) lidMap[lid] = m.phoneE164;
        }
        continue;
      }

      // Sobrou o caso do LID sem telefone ao lado. Em vez de descartar, fica
      // pendente: a cópia enriquecida da mesma conversa pode estar em
      // qualquer outra página.
      const pendente = pendenteDeLid(raw);
      if (pendente) {
        pendentes.push(pendente);
        continue;
      }

      descartadasOutras += 1;
    }

    return {
      mensagens,
      brutas: registros.length,
      lidMap,
      pendentes,
      descartadasOutras,
    };
  }

  return {
    id: "evolution",

    verifyWebhook({ url, headers }: WebhookRequest): boolean {
      const cfg = readConfig();
      if (!cfg.webhookSecret) return false;

      // Aceita o segredo no header ou na query: a tela de configuração de
      // webhook da Evolution nem sempre permite header customizado.
      const fornecido =
        headers.get("x-webhook-token") ?? url.searchParams.get("s") ?? "";

      return secretsMatch(fornecido, cfg.webhookSecret);
    },

    eventId(payload: unknown): string | null {
      const p = obj(payload);
      if (!p) return null;

      const evento = str(p.event);
      // Só mensagens interessam. Status de entrega, presença e afins são ruído.
      if (evento && !evento.startsWith("messages.")) return null;

      const mensagens = asArray(p.data);
      const ids = mensagens
        .map((m) => m?.key?.id)
        .filter((id): id is string => Boolean(id));

      if (ids.length === 0) return null;
      // Lote de mensagens: um id composto identifica o lote inteiro.
      return ids.length === 1 ? ids[0] : `batch:${ids.join(",").slice(0, 200)}`;
    },

    normalizeInbound(payload: unknown): NormalizedMessage[] {
      const p = obj(payload);
      if (!p) return [];
      return asArray(p.data)
        .map(normalizeOne)
        .filter((m): m is NormalizedMessage => m !== null);
    },

    pendentesInbound(payload: unknown): PendingLidMessage[] {
      const p = obj(payload);
      if (!p) return [];
      return asArray(p.data)
        .filter((raw) => normalizeOne(raw) === null)
        .map(pendenteDeLid)
        .filter((m): m is PendingLidMessage => m !== null);
    },

    async listChats(opts): Promise<WaChat[]> {
      const cfg = readConfig();
      type RawChat = {
        id?: string;
        remoteJid?: string;
        name?: string;
        pushName?: string;
        updatedAt?: string | number;
        lastMessage?: { messageTimestamp?: number | string };
      };

      const data = await call<RawChat[] | { chats?: RawChat[] }>(
        `/chat/findChats/${cfg.instance}`,
        { method: "POST", body: {} },
      );

      const lista = Array.isArray(data) ? data : (data.chats ?? []);
      const limite = opts?.limit ?? lista.length;

      return lista
        .map((c): WaChat | null => {
          const jid = c.remoteJid ?? c.id;
          if (!jid) return null;
          // Chat endereçado por LID não tem telefone aqui. Não inventamos um:
          // o histórico ainda é buscável pelo `chatId`, e cada mensagem traz o
          // `remoteJidAlt` de onde sai a identidade de verdade.
          const phoneE164 = isLidJid(jid) ? null : jidToPhone(jid) || null;
          const ts = c.lastMessage?.messageTimestamp ?? c.updatedAt;
          return {
            chatId: jid,
            phoneE164,
            name: c.name ?? c.pushName ?? null,
            isGroup: isGroupJid(jid),
            lastMessageAt: ts != null ? toIsoDate(ts) : null,
          };
        })
        .filter((c): c is WaChat => c !== null)
        .slice(0, limite);
    },

    async fetchChatHistory(chatId, opts): Promise<NormalizedMessage[]> {
      // ATENÇÃO: o filtro por chat da Evolution v2.3 NÃO funciona. A cláusula
      // é montada como
      //
      //   OR: [ remoteJid ? {...} : {}, remoteJidAlt ? {...} : {} ]
      //
      // e um `{}` dentro de um OR casa com tudo no Prisma. Mandando só o
      // remoteJid, o segundo ramo vira `{}` e o filtro inteiro é anulado: a
      // resposta são as mensagens mais recentes da INSTÂNCIA, não as do chat.
      //
      // Por isso o backfill usa fetchMessagesPage. Isto aqui fica para uso
      // pontual, e filtramos de novo do nosso lado para não devolver mensagem
      // de outra conversa a quem pediu uma.
      const pagina = await buscarPagina(1, opts?.limit ?? 100);
      return pagina.mensagens.filter((m) => m.chatId === chatId);
    },

    fetchMessagesPage({ page, pageSize }) {
      return buscarPagina(page, pageSize);
    },

    async sendText(phoneE164, text) {
      const cfg = readConfig();
      const data = await call<{ key?: { id?: string } }>(
        `/message/sendText/${cfg.instance}`,
        { method: "POST", body: { number: phoneE164, text } },
      );
      return { providerMessageId: data?.key?.id ?? "" };
    },

    async diagnosticarTelefone(phoneE164) {
      return diagnosticar(phoneE164, call, readConfig().instance);
    },

    async fetchLidMap(): Promise<LidMapResult> {
      const cfg = readConfig();
      const d = await call<unknown>(`/chat/findContacts/${cfg.instance}`, {
        method: "POST",
        body: {},
      });
      const arr = Array.isArray(d)
        ? d
        : ((d as Record<string, unknown>)?.findContacts as unknown[]) ?? [];

      const r = cruzarPorNome(arr as Record<string, unknown>[], 0);
      return {
        map: r.map,
        unicos: r.casamentosUnicos,
        ambiguos: r.ambiguos,
        semPar: r.semPar,
      };
    },

    async debugKeySample(limit: number): Promise<unknown[]> {
      const cfg = readConfig();

      type Resposta =
        | Record<string, unknown>[]
        | { messages?: { records?: Record<string, unknown>[] } | Record<string, unknown>[] };

      const data = await call<Resposta>(`/chat/findMessages/${cfg.instance}`, {
        method: "POST",
        body: { page: 1, offset: limit },
      });

      let registros: Record<string, unknown>[] = [];
      if (Array.isArray(data)) {
        registros = data;
      } else if (Array.isArray(data.messages)) {
        registros = data.messages;
      } else if (data.messages?.records) {
        registros = data.messages.records;
      }

      // Só endereçamento. `message` fica de fora de propósito: é lá que mora a
      // conversa, e diagnóstico não precisa dela.
      const chaves = registros.slice(0, limit).map((r) => ({
        key: r.key,
        messageType: r.messageType,
        pushName: r.pushName,
        source: r.source,
        participant: r.participant,
        contextInfoTem: r.contextInfo ? Object.keys(r.contextInfo as object) : null,
      }));

      const lista = async (rota: string): Promise<Record<string, unknown>[]> => {
        const d = await call<unknown>(`/chat/${rota}/${cfg.instance}`, {
          method: "POST",
          body: {},
        });
        const arr = Array.isArray(d)
          ? d
          : ((d as Record<string, unknown>)?.[rota] as unknown[]) ?? [];
        return arr as Record<string, unknown>[];
      };

      /** Quantos registros usam LID e quantos têm telefone de verdade. */
      const composicao = (l: Record<string, unknown>[]) => {
        let lid = 0;
        let telefone = 0;
        let outros = 0;
        let comNome = 0;
        for (const r of l) {
          const j = String(r.remoteJid ?? "");
          if (j.includes("@lid")) lid += 1;
          else if (j.includes("@s.whatsapp.net")) telefone += 1;
          else outros += 1;
          if (r.pushName) comNome += 1;
        }
        return { total: l.length, lid, telefone, outros, comNome };
      };

      let contatos: unknown = null;
      let chats: unknown = null;

      try {
        const c = await lista("findContacts");
        contatos = {
          composicao: composicao(c),
          // Nome é a única ponte possível entre a forma LID e a forma
          // telefone do mesmo contato. Vale ver se os nomes se repetem.
          amostraLid: c.filter((r) => String(r.remoteJid ?? "").includes("@lid"))
            .slice(0, limit)
            .map((r) => ({ remoteJid: r.remoteJid, pushName: r.pushName })),
          amostraTelefone: c
            .filter((r) => String(r.remoteJid ?? "").includes("@s.whatsapp.net"))
            .slice(0, limit)
            .map((r) => ({ remoteJid: r.remoteJid, pushName: r.pushName })),
          cruzamentoPorNome: (() => {
            const r = cruzarPorNome(c, limit);
            return {
              lidComNome: r.lidComNome,
              casamentosUnicos: r.casamentosUnicos,
              ambiguos: r.ambiguos,
              semPar: r.semPar,
              exemplos: r.exemplos,
              // Os recusados por inteiro: são poucos e é por aqui que o dono
              // descobre quem ficou de fora e por quê.
              naoResolvidos: r.naoResolvidos,
            };
          })(),
        };
      } catch (err) {
        contatos = { erro: err instanceof Error ? err.message.slice(0, 200) : "falha" };
      }

      try {
        const ch = await lista("findChats");
        const comLid = ch.filter((r) => String(r.remoteJid ?? "").includes("@lid"));
        chats = {
          composicao: composicao(ch),
          // A aposta: lastMessage é um objeto de mensagem, e mensagem tem
          // key. Se a key do lastMessage de um chat LID trouxer
          // remoteJidAlt, uma chamada resolve os 287 chats de uma vez.
          lastMessageDeChatsLid: comLid.slice(0, limit).map((r) => {
            const lm = r.lastMessage as Record<string, unknown> | undefined;
            return {
              remoteJid: r.remoteJid,
              temLastMessage: Boolean(lm),
              camposLastMessage: lm ? Object.keys(lm) : null,
              key: lm?.key ?? null,
            };
          }),
        };
      } catch (err) {
        chats = { erro: err instanceof Error ? err.message.slice(0, 200) : "falha" };
      }

      return [
        { fonte: "findMessages", amostra: chaves },
        { fonte: "findContacts", ...(contatos as object) },
        { fonte: "findChats", ...(chats as object) },
      ];
    },

    async connectionStatus(): Promise<WaConnection> {
      const cfg = readConfig();
      try {
        const data = await call<{ instance?: { state?: string } }>(
          `/instance/connectionState/${cfg.instance}`,
        );
        const state = data?.instance?.state ?? "desconhecido";
        return { connected: state === "open", label: state };
      } catch (err) {
        return {
          connected: false,
          label: err instanceof Error ? err.message : "erro",
        };
      }
    },
  };
}

// ============================================================================
//  Diagnóstico de um telefone
// ============================================================================

/** Teto de tempo da varredura: a rota tem 60s e precisa responder antes. */
const DIAG_LIMITE_MS = 40_000;
const DIAG_PAGINA = 200;
const DIAG_AMOSTRA = 10;

/** O número como veio e a outra forma dele (com/sem o 9º dígito). */
function variantesDoNumero(phoneE164: string): string[] {
  const d = String(phoneE164 ?? "").replace(/\D/g, "");
  const out = new Set<string>([d]);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9") {
    out.add(d.slice(0, 4) + d.slice(5));
  }
  if (d.startsWith("55") && d.length === 12) {
    out.add(d.slice(0, 4) + "9" + d.slice(4));
  }
  return Array.from(out);
}

/** Todo "123…@lid" (ou campo `lid` só com dígitos) em qualquer profundidade. */
function coletarLids(valor: unknown, acc: Set<string>, chave = ""): void {
  if (typeof valor === "string") {
    if (/^\d+@lid$/.test(valor)) acc.add(valor);
    else if (/lid/i.test(chave) && /^\d{6,}$/.test(valor)) acc.add(`${valor}@lid`);
    return;
  }
  if (Array.isArray(valor)) {
    for (const v of valor) coletarLids(v, acc, chave);
    return;
  }
  const o = obj(valor);
  if (o) for (const [k, v] of Object.entries(o)) coletarLids(v, acc, k);
}

function listaDe(d: unknown, rota: string): Record<string, unknown>[] {
  if (Array.isArray(d)) return d as Record<string, unknown>[];
  const o = obj(d);
  // A Evolution muda o envelope conforme a rota e a versão: a lista pode vir
  // na chave da rota, em `records` ou em `messages.records`.
  const candidatos = [o?.[rota], o?.records, obj(o?.messages)?.records, o?.messages];
  const lista = candidatos.find(Array.isArray);
  return (lista as Record<string, unknown>[] | undefined) ?? [];
}

function erroDe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Pergunta à Evolution, por três caminhos, o que ela sabe de um número.
 *
 * A varredura de mensagens não usa o filtro `where` do findMessages: na v2.3
 * ele é ignorado e devolve as mais recentes da instância (ver
 * fetchMessagesPage). Então lê página a página e filtra aqui.
 */
export async function diagnosticar(
  phoneE164: string,
  call: <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>,
  instancia: string,
): Promise<DiagnosticoTelefone> {
  const variantes = variantesDoNumero(phoneE164);
  const jids = new Set(variantes.map((v) => `${v}@s.whatsapp.net`));
  const lids = new Set<string>();

  // 1. "Esse número tem WhatsApp?" — em versões novas vem com o LID junto.
  let numeros: DiagnosticoTelefone["numeros"];
  try {
    const resposta = await call<unknown>(`/chat/whatsappNumbers/${instancia}`, {
      method: "POST",
      body: { numbers: variantes },
    });
    coletarLids(resposta, lids);
    numeros = { ok: true, resposta };
  } catch (err) {
    numeros = { ok: false, erro: erroDe(err) };
  }

  // 2. A agenda de contatos da instância, filtrada aqui mesmo.
  let contatos: DiagnosticoTelefone["contatos"];
  try {
    const d = await call<unknown>(`/chat/findContacts/${instancia}`, {
      method: "POST",
      body: { where: { remoteJid: Array.from(jids)[0] } },
    });
    const todos = listaDe(d, "findContacts");
    const encontrados = todos.filter((c) => {
      const texto = JSON.stringify(c);
      return variantes.some((v) => texto.includes(v));
    });
    coletarLids(encontrados, lids);
    contatos = {
      ok: true,
      totalRecebidos: todos.length,
      // Sem foto: é URL assinada e não ajuda no diagnóstico.
      encontrados: encontrados.map(({ profilePicUrl: _foto, ...resto }) => resto),
    };
  } catch (err) {
    contatos = { ok: false, erro: erroDe(err) };
  }

  // 3. O histórico, página a página.
  const mensagens: DiagnosticoTelefone["mensagens"] = {
    ok: true,
    paginasLidas: 0,
    mensagensLidas: 0,
    chegouAoFim: false,
    pelotelefone: 0,
    peloLid: 0,
    amostra: [],
  };
  const inicio = Date.now();
  try {
    for (let page = 1; Date.now() - inicio < DIAG_LIMITE_MS; page++) {
      const d = await call<unknown>(`/chat/findMessages/${instancia}`, {
        method: "POST",
        body: { page, offset: DIAG_PAGINA },
      });
      const registros = listaDe(d, "messages");
      mensagens.paginasLidas += 1;
      mensagens.mensagensLidas += registros.length;

      for (const r of registros) {
        const key = obj(r.key) ?? {};
        const rj = str(key.remoteJid);
        const alt = str(key.remoteJidAlt);
        const porTelefone = (rj && jids.has(rj)) || (alt && jids.has(alt));
        const porLid = (rj && lids.has(rj)) || (alt && lids.has(alt));
        if (!porTelefone && !porLid) continue;
        if (porTelefone) mensagens.pelotelefone += 1;
        else mensagens.peloLid += 1;
        if (mensagens.amostra.length < DIAG_AMOSTRA) {
          mensagens.amostra.push({
            id: str(key.id),
            fromMe: typeof key.fromMe === "boolean" ? key.fromMe : null,
            remoteJid: rj,
            remoteJidAlt: alt,
            tipo: str(r.messageType),
            data: r.messageTimestamp != null ? toIsoDate(r.messageTimestamp) : null,
          });
        }
      }

      if (registros.length < DIAG_PAGINA) {
        mensagens.chegouAoFim = true;
        break;
      }
    }
  } catch (err) {
    mensagens.ok = false;
    mensagens.erro = erroDe(err);
  }

  return { variantes, numeros, contatos, lids: Array.from(lids), mensagens };
}
