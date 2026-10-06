"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Erro de tela no painel, no lugar do "Application error" genérico do Next.
 *
 * O painel é usado no celular, onde não há console: sem a mensagem na tela, um
 * erro no navegador era impossível de diagnosticar. Erro do navegador aparece
 * inteiro; erro do servidor o Next esconde, e sobra o `digest`, que é o que
 * se procura nos logs da Vercel.
 */
export default function ErroDoPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[painel]", error);
  }, [error]);

  return (
    <div className="max-w-xl mx-auto py-12 space-y-4">
      <h1 className="font-display text-2xl text-ink">Algo quebrou nesta tela</h1>
      <p className="text-sm text-muted">
        Tire um print desta mensagem para o diagnóstico e tente de novo.
      </p>
      <pre className="text-xs whitespace-pre-wrap break-words border border-line bg-paper p-3 text-ink">
        {error.message || "(sem mensagem)"}
        {error.digest ? `\ndigest: ${error.digest}` : ""}
        {error.stack ? `\n\n${error.stack.split("\n").slice(0, 6).join("\n")}` : ""}
      </pre>
      <div className="flex gap-2">
        <Button onClick={reset}>Tentar de novo</Button>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Recarregar a página
        </Button>
      </div>
    </div>
  );
}
