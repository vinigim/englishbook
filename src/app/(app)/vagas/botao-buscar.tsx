"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function BotaoBuscar() {
  const router = useRouter();
  const [estado, setEstado] = useState<"parado" | "buscando" | string>("parado");

  async function buscar() {
    setEstado("buscando");
    const res = await fetch("/api/buscar", { method: "POST" });
    if (!res.ok) return setEstado("A busca falhou. Veja os logs.");
    const r = await res.json();
    setEstado(`${r.detalhadas ? `${r.detalhadas} descrição(ões) buscada(s), ` : ""}${r.triadas} triada(s), ${r.relevantes} relevante(s)${r.pendentes ? `, ${r.pendentes} para a próxima` : ""}`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {estado !== "parado" && estado !== "buscando" && <span className="text-xs text-slate-500">{estado}</span>}
      <Button onClick={buscar} disabled={estado === "buscando"}>
        {estado === "buscando" ? "Buscando… (até 5 min)" : "🔎 Buscar agora"}
      </Button>
    </div>
  );
}
