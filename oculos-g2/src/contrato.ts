/**
 * O que o painel devolve em GET /api/oculos/<codigo>.
 *
 * Cópia de `src/lib/laser/oculos.ts` do painel (este app é um projeto à
 * parte, sem acesso ao código de lá). Mudou lá, muda aqui.
 */
export type PaginaOculos = { titulo: string; linhas: string[] };

export type ConsultaOculos = {
  id: string;
  titulo: string;
  paginas: PaginaOculos[];
};

export type RespostaOculos = {
  versao: 1;
  locacao: { medico: string; data: string; equipamento: string | null };
  consultas: ConsultaOculos[];
};
