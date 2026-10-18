"use client";

import { useState } from "react";

export function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? "Copiado ✓" : rotulo}
    </button>
  );
}
