"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RADAR_PATH, urlDoRadar, veioDoRadar } from "./filtros-radar";

/**
 * "← Voltar ao radar" que devolve o dono aos filtros que ele estava usando.
 *
 * O href começa sem filtro e é trocado depois da montagem: o servidor não
 * enxerga o sessionStorage, e ler durante a renderização daria um HTML
 * diferente do servidor na hidratação.
 *
 * Na ficha de um lead aberto pela lista, o clique faz o "Voltar" do navegador:
 * a lista volta na hora, já carregada e na mesma rolagem. Em qualquer outro
 * caminho (link direto, página recarregada, outra tela) segue o link.
 */
export function VoltarAoRadar() {
  const [href, setHref] = useState(RADAR_PATH);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setHref(urlDoRadar());
  }, []);

  return (
    <Link
      href={href}
      onClick={(e) => {
        const leadId = pathname.split("/").pop() ?? "";
        if (window.history.length > 1 && veioDoRadar(leadId)) {
          e.preventDefault();
          router.back();
        }
      }}
      className="text-sm text-muted hover:text-ink transition-colors"
    >
      ← Voltar ao radar
    </Link>
  );
}
