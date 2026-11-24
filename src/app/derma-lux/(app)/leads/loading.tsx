/**
 * Aparece na hora em que o dono toca num lead ou em "← Voltar ao radar",
 * enquanto o servidor monta a página. A lista tem perto de mil leads e pode
 * levar uns segundos; sem isso a tela ficava parada e o toque parecia perdido.
 */
export default function CarregandoLeads() {
  return (
    <div className="py-16 text-center text-sm text-muted" role="status">
      Carregando…
    </div>
  );
}
