/**
 * Tipos da importação de planilha.
 *
 * Base veio do app whatsapp-prospector, que existia neste repositório e foi
 * removido depois que o Radar de Leads absorveu o que ele tinha de útil.
 * Acrescentei os papéis que fazem sentido no domínio da Lux Derma:
 * especialidade e cidade costumam vir na planilha de médicos e alimentam
 * direto o contexto da IA.
 */
export type ColumnRole =
  | "name"
  | "phone"
  | "company"
  | "email"
  | "specialty"
  | "city"
  | "instagram"
  | "custom";

/** Uma linha da planilha: cabeçalho -> valor, tudo como texto já aparado. */
export type ContactRow = Record<string, string>;

export type DetectedColumn = {
  header: string;
  role: ColumnRole;
  /** Primeiros valores não vazios, para o preview de conferência. */
  sample: string[];
};

export type ParseResult = {
  columns: DetectedColumn[];
  rows: ContactRow[];
  nameColumn: string | null;
  phoneColumn: string | null;
  totalRows: number;
};

/** Mapa cabeçalho -> papel, como o usuário confirmou na tela de preview. */
export type ColumnMapping = Record<string, ColumnRole>;

export type ImportReport = {
  criados: number;
  atualizados: number;
  invalidos: { linha: number; telefone: string; motivo: string }[];
};
