import { MUNICIPIOS } from "./municipios-dados";

/**
 * Onde fica uma cidade, para a conta de "até 100 km" das janelas da rota.
 *
 * Sem API de geocodificação de propósito: a agenda guarda o endereço como
 * texto livre e os leads guardam a cidade da planilha, e os dois cabem numa
 * tabela fixa dos 5.570 municípios. Não custa nada por consulta, não depende
 * de rede e dá o mesmo resultado sempre.
 */
export type Municipio = {
  nome: string;
  uf: string;
  lat: number;
  lon: number;
  ddd: string;
};

const UFS = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP",
  "TO",
]);

/** "São João d'Aliança" -> "sao joao d alianca". Mesma regra dos dois lados. */
export function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Indice = { porNome: Map<string, Municipio[]>; maxPalavras: number };
let indice: Indice | null = null;

function carregar(): Indice {
  if (indice) return indice;
  const porNome = new Map<string, Municipio[]>();
  let maxPalavras = 1;
  for (const linha of MUNICIPIOS.split("\n")) {
    const [nome, uf, lat, lon, ddd] = linha.split("|");
    if (!nome) continue;
    const m: Municipio = { nome, uf, lat: Number(lat), lon: Number(lon), ddd };
    const chave = normalizarNome(nome);
    const lista = porNome.get(chave);
    if (lista) lista.push(m);
    else porNome.set(chave, [m]);
    maxPalavras = Math.max(maxPalavras, chave.split(" ").length);
  }
  indice = { porNome, maxPalavras };
  return indice;
}

/** DDD do telefone em E.164 ("5535988887777" -> "35"). Nulo fora do Brasil. */
export function dddDoTelefone(telefone: string | null | undefined): string | null {
  const d = String(telefone ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d.slice(2, 4);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2);
  return null;
}

/**
 * Entre homônimos (há 5 "Bom Jesus" no país), fica o da UF informada; sem UF,
 * o do DDD do telefone. Se ainda sobrar mais de um, devolve nulo: chutar uma
 * cidade a 2.000 km daria uma janela que não existe.
 */
function desempatar(
  candidatos: Municipio[],
  uf: string | null,
  ddd: string | null,
): Municipio | null {
  let lista = candidatos;
  if (uf) lista = lista.filter((m) => m.uf === uf);
  if (lista.length > 1 && ddd) {
    const doDdd = lista.filter((m) => m.ddd === ddd);
    if (doDdd.length > 0) lista = doDdd;
  }
  return lista.length === 1 ? lista[0] : null;
}

/**
 * A cidade do lead, como a planilha escreveu: "Pouso Alegre", "Pouso
 * Alegre/MG", "Pouso Alegre - MG", com a UF às vezes numa coluna à parte.
 */
export function resolverCidade(
  cidade: string | null | undefined,
  uf: string | null | undefined,
  telefone?: string | null,
): Municipio | null {
  if (!cidade?.trim()) return null;
  const { porNome } = carregar();

  let nome = normalizarNome(cidade);
  let ufFinal = uf?.trim().toUpperCase() || null;
  const partes = nome.split(" ");
  const ultima = partes[partes.length - 1]?.toUpperCase();
  if (partes.length > 1 && ultima && UFS.has(ultima) && !porNome.has(nome)) {
    nome = partes.slice(0, -1).join(" ");
    ufFinal = ufFinal ?? ultima;
  }
  if (ufFinal && !UFS.has(ufFinal)) ufFinal = null;

  const candidatos = porNome.get(nome);
  if (!candidatos) return null;
  return desempatar(candidatos, ufFinal, dddDoTelefone(telefone));
}

/**
 * Palavras que, logo antes de um nome de cidade, dizem que aquilo é rua ou
 * bairro: "Rua São Paulo", "Av. Brasil", "Jardim América".
 */
const LOGRADOURO = new Set([
  "rua", "r", "av", "avenida", "al", "alameda", "travessa", "tv", "praca",
  "pca", "rodovia", "rod", "estrada", "largo", "bairro", "jardim", "jd",
  "vila", "vl", "parque", "pq", "residencial", "condominio", "edificio", "ed",
  "conjunto", "loteamento", "chacara", "sitio", "fazenda", "setor", "quadra",
  "beco", "viela", "ladeira", "esquina", "shopping", "hospital", "clinica",
]);

/**
 * A cidade dentro de um endereço de texto livre da agenda.
 *
 * Procura todo trecho do endereço que seja nome de município. Com UF escrita
 * no endereço, só vale cidade daquela UF; fora isso a cidade costuma vir por
 * último ("Rua X, 123, Centro, Pouso Alegre - MG"), então ganha a última, e
 * entre duas que terminam no mesmo ponto, a mais longa ("Santa Rita do
 * Sapucaí", e não "Sapucaí"). O telefone do cliente desempata homônimos.
 */
export function cidadeDoEndereco(
  endereco: string | null | undefined,
  telefone?: string | null,
): Municipio | null {
  if (!endereco?.trim()) return null;
  const { porNome, maxPalavras } = carregar();

  // Pedaços do endereço: vírgula, " - ", barra, parêntese e número separam
  // rua de bairro de cidade. Pedaço que começa por "Rua", "Jardim" etc. é
  // logradouro ou bairro inteiro, e nada dentro dele vale como cidade ("Rua
  // das Flores" não é Flores-PE). Hífen sem espaço fica: "Embu-Guaçu".
  const pedacos = endereco
    .split(/\s[-–]\s|[,;\/()|]|\d+/)
    .map((p) => normalizarNome(p).split(" ").filter(Boolean))
    .filter((t) => t.length > 0 && !LOGRADOURO.has(t[0]));

  // UFs escritas no endereço. "es", "pa", "to" etc. também são palavras
  // comuns em minúscula, então só conta o que estava em maiúscula no original
  // ou o que vem depois de um hífen ou barra ("- mg", "/sp").
  const ufsNoTexto = new Set<string>();
  for (const m of endereco.matchAll(/(?:^|[\s,\-\/(])([A-Za-z]{2})(?=$|[\s,.)\-\/])/g)) {
    const sigla = m[1].toUpperCase();
    const antes = endereco.slice(0, m.index! + m[0].length - 2);
    const marcado = m[1] === sigla || /[-\/]\s*$/.test(antes);
    if (UFS.has(sigla) && marcado) ufsNoTexto.add(sigla);
  }
  const ufUnica = ufsNoTexto.size === 1 ? [...ufsNoTexto][0] : null;
  const ddd = dddDoTelefone(telefone);

  type Achado = { pedaco: number; fim: number; tamanho: number; m: Municipio };
  const achados: Achado[] = [];
  pedacos.forEach((tokens, p) => {
    for (let i = 0; i < tokens.length; i++) {
      for (let n = 1; n <= maxPalavras && i + n <= tokens.length; n++) {
        const candidatos = porNome.get(tokens.slice(i, i + n).join(" "));
        if (!candidatos) continue;
        const doTexto =
          ufsNoTexto.size > 0
            ? candidatos.filter((c) => ufsNoTexto.has(c.uf))
            : candidatos;
        const m = desempatar(doTexto, ufUnica, ddd);
        if (m) achados.push({ pedaco: p, fim: i + n, tamanho: n, m });
      }
    }
  });
  if (achados.length === 0) return null;

  achados.sort(
    (a, b) => b.pedaco - a.pedaco || b.fim - a.fim || b.tamanho - a.tamanho,
  );
  return achados[0].m;
}

/** Distância em linha reta (haversine). A estrada é uns 20–30% maior. */
export function distanciaKm(a: Municipio, b: Municipio): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
