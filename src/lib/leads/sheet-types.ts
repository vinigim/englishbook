/**
 * Tipos da importação de planilha.
 *
 * Base copiada de whatsapp-prospector/src/lib/types.ts (aquele app está no
 * "exclude" do tsconfig da raiz, então não dá para importar de lá), acrescida
 * dos papéis que fazem sentido no domínio da Lux Derma: especialidade e cidade
 * costumam vir na planilha de médicos e alimentam direto o contexto da IA.
 */
export type ColumnRole =
  | "name"
  | "phone"
  | "company"
  | "email"
  | "specialty"
  | "city"
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
