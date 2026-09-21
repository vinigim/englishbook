import Link from "next/link";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Importar planilha — Radar de Leads",
};

export default function ImportarPage() {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/derma-lux/leads"
          className="text-sm text-muted hover:text-ink transition-colors"
        >
          ← Voltar ao radar
        </Link>
        <h1 className="font-display text-3xl text-ink tracking-tight mt-2">
          Importar planilha
        </h1>
        <p className="text-muted text-sm mt-1">
          Aceita .xlsx, .xls e .csv. A primeira linha precisa ser o cabeçalho.
          Os dados da planilha nunca sobrescrevem o que veio das conversas do
          WhatsApp.
        </p>
      </div>

      <ImportClient />
    </div>
  );
}
