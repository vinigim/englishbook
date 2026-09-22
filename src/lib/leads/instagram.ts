/**
 * Instagram do lead: normalização e link para o direct.
 *
 * A planilha de prospecção traz o Instagram escrito de todo jeito — "@fulana",
 * "fulana", "instagram.com/fulana", o link inteiro que o app copia com o
 * `?igshid=` grudado no fim. Tudo isso é a mesma conta, e guardar cada variação
 * como veio significaria montar link quebrado metade das vezes.
 *
 * Então só o "handle" é guardado, e o link é montado na hora.
 */

/**
 * Perfis do Instagram: letras, números, ponto e underline, até 30 caracteres.
 *
 * Maiúscula não conta — o Instagram trata o handle como indiferente à caixa —,
 * por isso a normalização baixa tudo antes de testar.
 */
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

/**
 * Primeiros segmentos de caminho que NÃO são perfil.
 *
 * Sem isto, colar o link de um post ("instagram.com/p/ABC123") viraria um
 * "perfil" chamado `p`, e o botão levaria o dono a lugar nenhum.
 */
const RESERVADOS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "direct",
  "accounts",
  "share",
  "s",
]);

/**
 * Endereço de site escrito sem "http://" e sem barra — "clinicafulana.com.br".
 *
 * Ponto é caractere válido em handle, então isso passaria batido pelo
 * HANDLE_RE e o botão abriria um direct para uma conta que não existe. A lista
 * é de terminações conhecidas em vez de "ponto seguido de letras" porque um
 * perfil chamado `dra.fulana` é comum e não pode ser recusado junto.
 */
const PARECE_DOMINIO =
  /^www\.|\.(com|com\.br|net|org|br|io|co|app|site|online|info)$/;

/**
 * Extrai o handle de qualquer forma razoável de escrever um Instagram.
 *
 * Devolve `null` para o que não dá para afirmar que é um perfil — "não tem",
 * "-", um nome com espaço, o link de um post. Melhor não mostrar botão do que
 * mostrar um que abre a conta errada.
 */
export function toInstagramHandle(
  valor: string | null | undefined,
): string | null {
  let texto = String(valor ?? "").trim();
  if (!texto) return null;

  const doLink = texto.match(/instagram\.com\/([^/?#\s]+)/i);
  if (doLink) {
    texto = doLink[1];
  } else if (/^[a-z]+:\/\//i.test(texto) || texto.includes("/")) {
    // Link que não é do Instagram (um Facebook, um site da clínica) não vira
    // handle por recorte — viraria um perfil inventado.
    return null;
  }

  texto = texto
    .replace(/^@+/, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();

  if (!HANDLE_RE.test(texto)) return null;
  if (RESERVADOS.has(texto)) return null;
  // O recorte do link já garantiu que veio do instagram.com; a checagem só
  // vale para o que foi digitado solto.
  if (!doLink && PARECE_DOMINIO.test(texto)) return null;

  return texto;
}

/**
 * Link do direct, o equivalente do `wa.me` para o Instagram.
 *
 * No celular o `ig.me` abre o app direto na conversa com a pessoa. A diferença
 * em relação ao WhatsApp é que ele NÃO aceita o texto da mensagem na URL: o
 * rascunho tem que ir pela área de transferência.
 */
export function instagramDirectUrl(handle: string): string {
  return `https://ig.me/m/${handle}`;
}

/** O perfil. Serve de saída quando o direct não abre por algum motivo. */
export function instagramProfileUrl(handle: string): string {
  return `https://www.instagram.com/${handle}`;
}
