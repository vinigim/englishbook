/**
 * Cópia síncrona, pelo caminho antigo (textarea + execCommand).
 *
 * Obsoleto no papel, mas é o único que termina DENTRO do toque em qualquer
 * navegador, inclusive o Safari do iPhone. Devolve falso quando o navegador
 * recusa, para quem chamou tentar a Clipboard API.
 */
export function copiarNaHora(texto: string): boolean {
  if (typeof document === "undefined") return false;
  const campo = document.createElement("textarea");
  campo.value = texto;
  campo.setAttribute("readonly", "");
  // Fora da tela, e com fonte de 16px para o iOS não dar zoom ao focar.
  campo.style.position = "fixed";
  campo.style.top = "0";
  campo.style.left = "-9999px";
  campo.style.fontSize = "16px";
  document.body.appendChild(campo);
  try {
    campo.focus();
    campo.select();
    campo.setSelectionRange(0, texto.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(campo);
  }
}
