"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type {
  ColumnMapping,
  ColumnRole,
  ImportReport,
  ParseResult,
} from "@/lib/leads/sheet-types";

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: "phone", label: "Telefone" },
  { value: "name", label: "Nome" },
  { value: "company", label: "Clínica / empresa" },
  { value: "specialty", label: "Especialidade" },
  { value: "city", label: "Cidade" },
  { value: "email", label: "E-mail" },
  { value: "custom", label: "Guardar como extra" },
];

export function ImportClient() {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [report, setReport] = useState<ImportReport | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function enviarArquivo(file: File) {
    setErro(null);
    setReport(null);
    setCarregando(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/leads/import?step=parse", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.message ?? "Não consegui ler este arquivo.");
        return;
      }
      const result = json as ParseResult;
      setParsed(result);
      setMapping(
        Object.fromEntries(result.columns.map((c) => [c.header, c.role])),
      );
    } catch {
      setErro("Falha ao enviar o arquivo.");
    } finally {
      setCarregando(false);
    }
  }

  async function confirmar() {
    if (!parsed) return;
    setErro(null);
    setCarregando(true);
    try {
      const res = await fetch("/api/leads/import?step=commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: parsed.rows, mapping }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.message ?? "Não consegui importar.");
        return;
      }
      setReport(json as ImportReport);
      setParsed(null);
      router.refresh();
    } catch {
      setErro("Falha ao importar.");
    } finally {
      setCarregando(false);
    }
  }

  const temTelefone = Object.values(mapping).includes("phone");

  return (
    <div className="space-y-4">
      {erro ? (
        <Alert variant="danger" title="Deu problema">
          {erro}
        </Alert>
      ) : null}

      {report ? (
        <Alert variant="success" title="Importação concluída">
          <p>
            {report.criados} {report.criados === 1 ? "lead novo" : "leads novos"}
            {" · "}
            {report.atualizados}{" "}
            {report.atualizados === 1 ? "atualizado" : "atualizados"}
            {report.invalidos.length > 0
              ? ` · ${report.invalidos.length} linha(s) ignorada(s)`
              : ""}
          </p>
          {report.invalidos.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer">
                Ver linhas ignoradas
              </summary>
              <ul className="mt-1 space-y-0.5">
                {report.invalidos.slice(0, 50).map((inv, i) => (
                  <li key={i}>
                    Linha {inv.linha}: {inv.motivo}
                    {inv.telefone ? ` (“${inv.telefone}”)` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Alert>
      ) : null}

      {!parsed ? (
        <Card variant="bordered">
          <label className="block">
            <span className="block text-sm font-medium text-ink mb-2">
              Escolha a planilha
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              disabled={carregando}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enviarArquivo(f);
              }}
              className="block w-full text-sm text-ink file:mr-3 file:px-4 file:py-2 file:border file:border-ink file:bg-paper file:text-ink file:text-sm file:font-medium hover:file:bg-ink hover:file:text-paper file:transition-colors"
            />
          </label>
          {carregando ? (
            <p className="text-sm text-muted mt-3">Lendo a planilha…</p>
          ) : null}
        </Card>
      ) : (
        <Card variant="bordered">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <h2 className="font-display text-xl text-ink tracking-tight">
              Confira as colunas
            </h2>
            <span className="text-sm text-muted">
              {parsed.totalRows} linhas encontradas
            </span>
          </div>

          <p className="text-sm text-muted mb-4">
            Detectei o papel de cada coluna automaticamente. Corrija o que
            estiver errado antes de importar.
          </p>

          <div className="space-y-2">
            {parsed.columns.map((col) => (
              <div
                key={col.header}
                className="flex flex-wrap items-center gap-3 py-2 border-b border-line last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink text-sm truncate">
                    {col.header}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {col.sample.length > 0
                      ? col.sample.slice(0, 3).join(" · ")
                      : "sem exemplos"}
                  </p>
                </div>

                <select
                  value={mapping[col.header] ?? "custom"}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      [col.header]: e.target.value as ColumnRole,
                    }))
                  }
                  className="px-3 py-2 text-base sm:text-sm bg-paper border border-line focus:border-ink focus:outline-none"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {!temTelefone ? (
            <Alert variant="warning" className="mt-4">
              Nenhuma coluna está marcada como telefone. O telefone é o que
              identifica o lead — marque uma para continuar.
            </Alert>
          ) : null}

          <div className="flex items-center gap-2 mt-5">
            <Button
              onClick={confirmar}
              loading={carregando}
              disabled={!temTelefone}
            >
              Importar {parsed.totalRows} linhas
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setParsed(null);
                setErro(null);
              }}
              disabled={carregando}
            >
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
