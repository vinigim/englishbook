"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RADAR_PATH, urlDoRadar } from "./filtros-radar";

/**
 * "← Voltar ao radar" que devolve o dono aos filtros que ele estava usando.
 *
 * O href começa sem filtro e é trocado depois da montagem: o servidor não
 * enxerga o sessionStorage, e ler durante a renderização daria um HTML
 * diferente do servidor na hidratação.
 */
export function VoltarAoRadar() {
  const [href, setHref] = useState(RADAR_PATH);

  useEffect(() => {
    setHref(urlDoRadar());
  }, []);

  return (
    <Link
      href={href}
      className="text-sm text-muted hover:text-ink transition-colors"
    >
      ← Voltar ao radar
    </Link>
  );
}
