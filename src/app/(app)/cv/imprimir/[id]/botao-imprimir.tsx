"use client";

import { Button } from "@/components/ui";

export function BotaoImprimir() {
  return <Button onClick={() => window.print()}>Imprimir / Salvar em PDF</Button>;
}
