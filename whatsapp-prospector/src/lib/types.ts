// Tipos compartilhados entre o servidor e o cliente.

/** Uma linha da planilha, com chaves = cabeçalhos normalizados. */
export type ContactRow = Record<string, string>;

/** Papel semântico que uma coluna pode ter. */
export type ColumnRole = "name" | "phone" | "company" | "email" | "custom";

export interface DetectedColumn {
  /** Cabeçalho original como apareceu na planilha. */
  header: string;
  /** Papel detectado automaticamente (pode ser sobrescrito no front). */
  role: ColumnRole;
  /** Amostra dos primeiros valores, para o usuário conferir. */
  sample: string[];
}

export interface ParseResult {
  columns: DetectedColumn[];
  rows: ContactRow[];
  /** Cabeçalho sugerido para o nome. */
  nameColumn: string | null;
  /** Cabeçalho sugerido para o telefone. */
  phoneColumn: string | null;
  totalRows: number;
}

/** Um destinatário já preparado para envio. */
export interface PreparedContact {
  /** Índice da linha original (para relatório). */
  index: number;
  /** Nome usado na personalização. */
  name: string;
  /** Telefone em E.164 sem o "+", ex: "5511999998888". */
  phoneE164: string | null;
  /** Telefone como estava na planilha (para diagnóstico). */
  rawPhone: string;
  /** Variáveis do template, na ordem {{1}}, {{2}}, ... */
  variables: string[];
  /** Mensagem renderizada (apenas para preview no front). */
  preview: string;
  /** Motivo de o contato ser inválido, se for o caso. */
  error?: string;
  /** O "1º nome" foi extraído de algo que parece nome de empresa. */
  nameWarning?: boolean;
}

/** Um template de mensagem cadastrado na conta WhatsApp Business (Meta). */
export interface MetaTemplate {
  name: string;
  language: string;
  status: string; // APPROVED, PENDING, REJECTED...
  category: string;
  bodyText: string | null;
  variableCount: number;
}

export interface SendResultLine {
  index: number;
  phoneE164: string | null;
  name: string;
  status: "sent" | "failed" | "skipped";
  messageId?: string;
  error?: string;
}
