"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizePhone } from "@/lib/phone";
import { firstName, renderTemplateBody, countTemplateVariables } from "@/lib/message";
import type {
  DetectedColumn,
  ParseResult,
  PreparedContact,
  SendResultLine,
} from "@/lib/types";

type Step = "upload" | "map" | "compose" | "review";

interface VarSlot {
  /** cabeçalho da coluna que preenche a variável, ou "" para literal */
  column: string;
  /** usar só o primeiro nome do valor */
  firstNameOnly: boolean;
  /** texto fixo quando column === "" */
  literal: string;
}

const DEFAULT_TEMPLATE =
  "Olá {{1}}! Tudo bem? Sou da [Sua Empresa] e gostaria de te apresentar uma oportunidade.";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // mapeamento
  const [nameCol, setNameCol] = useState<string>("");
  const [phoneCol, setPhoneCol] = useState<string>("");

  // template
  const [templateName, setTemplateName] = useState("");
  const [languageCode, setLanguageCode] = useState("pt_BR");
  const [templateBody, setTemplateBody] = useState(DEFAULT_TEMPLATE);
  const [slots, setSlots] = useState<VarSlot[]>([]);

  // envio
  const [delayMs, setDelayMs] = useState(4000);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Record<number, SendResultLine>>({});
  const [summary, setSummary] = useState<{
    sent: number;
    failed: number;
    skipped: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const varCount = useMemo(
    () => countTemplateVariables(templateBody),
    [templateBody],
  );

  // Ajusta a quantidade de slots quando o número de variáveis muda.
  useEffect(() => {
    setSlots((prev) => {
      if (prev.length === varCount) return prev;
      const next: VarSlot[] = [];
      for (let i = 0; i < varCount; i++) {
        next[i] =
          prev[i] ??
          (i === 0
            ? { column: nameCol, firstNameOnly: true, literal: "" }
            : { column: "", firstNameOnly: false, literal: "" });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varCount]);

  // ---- Upload -------------------------------------------------------------
  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao ler a planilha.");
      const result = data as ParseResult;
      setParse(result);
      setNameCol(result.nameColumn ?? "");
      setPhoneCol(result.phoneColumn ?? "");
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // ---- Preparação dos contatos -------------------------------------------
  const prepared: PreparedContact[] = useMemo(() => {
    if (!parse || !phoneCol) return [];
    return parse.rows.map((row, index) => {
      const rawName = nameCol ? row[nameCol] ?? "" : "";
      const rawPhone = row[phoneCol] ?? "";
      const phoneE164 = normalizePhone(rawPhone);

      const variables = slots.map((slot) => {
        if (!slot.column) return slot.literal;
        const value = row[slot.column] ?? "";
        return slot.firstNameOnly ? firstName(value) : value;
      });

      return {
        index,
        name: rawName,
        phoneE164,
        rawPhone,
        variables,
        preview: renderTemplateBody(templateBody, variables),
        error: phoneE164 ? undefined : "telefone inválido",
      };
    });
  }, [parse, nameCol, phoneCol, slots, templateBody]);

  const validContacts = prepared.filter((c) => c.phoneE164);
  const invalidContacts = prepared.filter((c) => !c.phoneE164);

  // ---- Envio (stream NDJSON) ---------------------------------------------
  async function startSend(dryRun: boolean) {
    if (validContacts.length === 0) return;
    if (!dryRun && !templateName.trim()) {
      setError("Informe o nome do template aprovado na Meta.");
      return;
    }
    setError(null);
    setResults({});
    setSummary(null);
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          templateName: templateName || "dry_run",
          languageCode,
          delayMs,
          dryRun,
          contacts: validContacts.map((c) => ({
            index: c.index,
            name: c.name,
            to: c.phoneE164,
            variables: c.variables,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line);
          if (obj.done) {
            setSummary({
              sent: obj.sent,
              failed: obj.failed,
              skipped: obj.skipped,
            });
          } else {
            const r = obj as SendResultLine;
            setResults((prev) => ({ ...prev, [r.index]: r }));
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function stopSend() {
    abortRef.current?.abort();
  }

  function downloadReport() {
    const rows = prepared.map((c) => {
      const r = results[c.index];
      return {
        nome: c.name,
        telefone: c.phoneE164 ?? c.rawPhone,
        status: r?.status ?? (c.phoneE164 ? "não enviado" : "inválido"),
        message_id: r?.messageId ?? "",
        erro: r?.error ?? c.error ?? "",
        mensagem: c.preview,
      };
    });
    const headers = Object.keys(rows[0] ?? { nome: "" });
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((h) => `"${String((row as any)[h] ?? "").replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-disparo-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-wa-dark">
          WhatsApp Prospector
        </h1>
        <p className="text-sm text-gray-500">
          Envio de mensagens personalizadas via WhatsApp Cloud API oficial.
        </p>
      </header>

      <Stepper step={step} />

      <ComplianceBanner />

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === "upload" && (
        <UploadStep loading={loading} onFile={handleFile} />
      )}

      {step === "map" && parse && (
        <MapStep
          parse={parse}
          nameCol={nameCol}
          phoneCol={phoneCol}
          setNameCol={setNameCol}
          setPhoneCol={setPhoneCol}
          validCount={validContacts.length}
          invalidCount={invalidContacts.length}
          onBack={() => setStep("upload")}
          onNext={() => setStep("compose")}
        />
      )}

      {step === "compose" && parse && (
        <ComposeStep
          columns={parse.columns}
          templateName={templateName}
          setTemplateName={setTemplateName}
          languageCode={languageCode}
          setLanguageCode={setLanguageCode}
          templateBody={templateBody}
          setTemplateBody={setTemplateBody}
          slots={slots}
          setSlots={setSlots}
          sampleContact={validContacts[0]}
          onBack={() => setStep("map")}
          onNext={() => setStep("review")}
        />
      )}

      {step === "review" && (
        <ReviewStep
          prepared={prepared}
          validCount={validContacts.length}
          invalidCount={invalidContacts.length}
          delayMs={delayMs}
          setDelayMs={setDelayMs}
          sending={sending}
          results={results}
          summary={summary}
          onBack={() => setStep("compose")}
          onDryRun={() => startSend(true)}
          onSend={() => startSend(false)}
          onStop={stopSend}
          onDownload={downloadReport}
        />
      )}
    </main>
  );
}

// ===========================================================================
// Sub-componentes
// ===========================================================================

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "1. Planilha" },
    { key: "map", label: "2. Colunas" },
    { key: "compose", label: "3. Mensagem" },
    { key: "review", label: "4. Disparo" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <ol className="mb-6 flex gap-2 text-sm">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={`flex-1 rounded-md px-3 py-2 text-center font-medium ${
            i === activeIndex
              ? "bg-wa-teal text-white"
              : i < activeIndex
                ? "bg-wa-green/20 text-wa-dark"
                : "bg-white text-gray-400 border border-gray-200"
          }`}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function ComplianceBanner() {
  return (
    <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
      <strong>Uso responsável:</strong> a Cloud API exige templates aprovados
      pela Meta e destinatários que consentiram em receber contato. Disparos
      para números que nunca interagiram com você geram denúncias e podem
      derrubar a qualidade/registro do seu número. Inclua sempre opção de
      opt-out.
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      {children}
    </div>
  );
}

function UploadStep({
  loading,
  onFile,
}: {
  loading: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <Card>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-gray-300 px-6 py-12 text-center hover:border-wa-green">
        <span className="text-4xl">📄</span>
        <span className="font-medium text-gray-700">
          {loading ? "Processando…" : "Clique para enviar sua planilha"}
        </span>
        <span className="text-xs text-gray-400">
          .csv, .xlsx ou .xls — a primeira linha deve conter os cabeçalhos
        </span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>
    </Card>
  );
}

function RoleBadge({ role }: { role: DetectedColumn["role"] }) {
  const map: Record<string, string> = {
    name: "bg-blue-100 text-blue-700",
    phone: "bg-green-100 text-green-700",
    email: "bg-purple-100 text-purple-700",
    company: "bg-orange-100 text-orange-700",
    custom: "bg-gray-100 text-gray-500",
  };
  const labels: Record<string, string> = {
    name: "nome",
    phone: "telefone",
    email: "e-mail",
    company: "empresa",
    custom: "—",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[role]}`}>
      {labels[role]}
    </span>
  );
}

function MapStep({
  parse,
  nameCol,
  phoneCol,
  setNameCol,
  setPhoneCol,
  validCount,
  invalidCount,
  onBack,
  onNext,
}: {
  parse: ParseResult;
  nameCol: string;
  phoneCol: string;
  setNameCol: (v: string) => void;
  setPhoneCol: (v: string) => void;
  validCount: number;
  invalidCount: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const headers = parse.columns.map((c) => c.header);
  return (
    <Card>
      <p className="mb-4 text-sm text-gray-600">
        Detectamos <strong>{parse.totalRows}</strong> contatos. Confirme quais
        colunas são o <strong>nome</strong> e o <strong>telefone</strong>.
      </p>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Coluna do telefone <span className="text-red-500">*</span>
          </label>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={phoneCol}
            onChange={(e) => setPhoneCol(e.target.value)}
          >
            <option value="">— selecione —</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Coluna do nome
          </label>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={nameCol}
            onChange={(e) => setNameCol(e.target.value)}
          >
            <option value="">— nenhuma —</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      </div>

      {phoneCol && (
        <div className="mb-5 flex gap-4 text-sm">
          <span className="rounded bg-green-100 px-2 py-1 text-green-700">
            {validCount} números válidos
          </span>
          {invalidCount > 0 && (
            <span className="rounded bg-red-100 px-2 py-1 text-red-700">
              {invalidCount} inválidos (serão pulados)
            </span>
          )}
        </div>
      )}

      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
        Prévia das colunas detectadas
      </div>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              {parse.columns.map((c) => (
                <th key={c.header} className="px-3 py-2 font-medium">
                  <div className="flex items-center gap-2">
                    {c.header} <RoleBadge role={c.role} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parse.rows.slice(0, 3).map((row, i) => (
              <tr key={i} className="border-t border-gray-100">
                {parse.columns.map((c) => (
                  <td key={c.header} className="px-3 py-2 text-gray-600">
                    {row[c.header]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NavButtons
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!phoneCol || validCount === 0}
      />
    </Card>
  );
}

function ComposeStep({
  columns,
  templateName,
  setTemplateName,
  languageCode,
  setLanguageCode,
  templateBody,
  setTemplateBody,
  slots,
  setSlots,
  sampleContact,
  onBack,
  onNext,
}: {
  columns: DetectedColumn[];
  templateName: string;
  setTemplateName: (v: string) => void;
  languageCode: string;
  setLanguageCode: (v: string) => void;
  templateBody: string;
  setTemplateBody: (v: string) => void;
  slots: VarSlot[];
  setSlots: React.Dispatch<React.SetStateAction<VarSlot[]>>;
  sampleContact?: PreparedContact;
  onBack: () => void;
  onNext: () => void;
}) {
  const headers = columns.map((c) => c.header);

  function updateSlot(i: number, patch: Partial<VarSlot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  return (
    <Card>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Nome do template (Meta) <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="ex: prospeccao_inicial"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">
            Deve ser um template já <strong>aprovado</strong> na sua conta.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Idioma</label>
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-400">
            Código do template, ex: <code>pt_BR</code>, <code>en_US</code>.
          </p>
        </div>
      </div>

      <label className="mb-1 block text-sm font-medium">
        Corpo do template (com {"{{1}}"}, {"{{2}}"}…)
      </label>
      <textarea
        className="mb-1 h-28 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        value={templateBody}
        onChange={(e) => setTemplateBody(e.target.value)}
      />
      <p className="mb-4 text-xs text-gray-400">
        Cole aqui exatamente o texto aprovado na Meta. As variáveis {"{{n}}"}{" "}
        serão preenchidas por coluna abaixo.
      </p>

      {slots.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Variáveis
          </div>
          {slots.map((slot, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-3 py-2"
            >
              <span className="font-mono text-sm text-wa-teal">{`{{${i + 1}}}`}</span>
              <span className="text-sm text-gray-400">=</span>
              <select
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={slot.column}
                onChange={(e) => updateSlot(i, { column: e.target.value })}
              >
                <option value="">(texto fixo)</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              {slot.column ? (
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={slot.firstNameOnly}
                    onChange={(e) =>
                      updateSlot(i, { firstNameOnly: e.target.checked })
                    }
                  />
                  só 1º nome
                </label>
              ) : (
                <input
                  className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                  placeholder="texto fixo"
                  value={slot.literal}
                  onChange={(e) => updateSlot(i, { literal: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {sampleContact && (
        <div className="mb-4">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Prévia (1º contato: {sampleContact.name || "sem nome"})
          </div>
          <div className="rounded-lg bg-[#dcf8c6] px-4 py-3 text-sm text-gray-800 shadow-sm">
            {sampleContact.preview}
          </div>
        </div>
      )}

      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={false} />
    </Card>
  );
}

function ReviewStep({
  prepared,
  validCount,
  invalidCount,
  delayMs,
  setDelayMs,
  sending,
  results,
  summary,
  onBack,
  onDryRun,
  onSend,
  onStop,
  onDownload,
}: {
  prepared: PreparedContact[];
  validCount: number;
  invalidCount: number;
  delayMs: number;
  setDelayMs: (v: number) => void;
  sending: boolean;
  results: Record<number, SendResultLine>;
  summary: { sent: number; failed: number; skipped: number } | null;
  onBack: () => void;
  onDryRun: () => void;
  onSend: () => void;
  onStop: () => void;
  onDownload: () => void;
}) {
  const done = Object.keys(results).length;
  const progress = validCount > 0 ? Math.round((done / validCount) * 100) : 0;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="rounded bg-green-100 px-2 py-1 text-green-700">
          {validCount} para enviar
        </span>
        {invalidCount > 0 && (
          <span className="rounded bg-red-100 px-2 py-1 text-red-700">
            {invalidCount} inválidos (pulados)
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-gray-600">
          Intervalo entre envios:
          <input
            type="number"
            min={0}
            step={500}
            className="w-24 rounded-md border border-gray-300 px-2 py-1"
            value={delayMs}
            onChange={(e) => setDelayMs(Number(e.target.value))}
            disabled={sending}
          />
          ms
        </label>
      </div>

      {(sending || done > 0) && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-xs text-gray-500">
            <span>
              {done}/{validCount} processados
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-wa-green transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {summary && (
        <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <strong>Concluído.</strong> Enviados: {summary.sent} · Falhas:{" "}
          {summary.failed} · Pulados: {summary.skipped}
        </div>
      )}

      <div className="mb-4 max-h-80 overflow-y-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Telefone</th>
              <th className="px-3 py-2 font-medium">Mensagem</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {prepared.slice(0, 100).map((c) => {
              const r = results[c.index];
              return (
                <tr key={c.index} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2">{c.name || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {c.phoneE164 ?? (
                      <span className="text-red-500">{c.rawPhone} (inválido)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{c.preview}</td>
                  <td className="px-3 py-2">
                    <StatusPill
                      status={
                        r?.status ?? (c.phoneE164 ? "pending" : "invalid")
                      }
                      error={r?.error}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {prepared.length > 100 && (
        <p className="mb-4 text-xs text-gray-400">
          Exibindo os primeiros 100 de {prepared.length}. O relatório completo
          está no CSV.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          disabled={sending}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 disabled:opacity-50"
        >
          ← Voltar
        </button>
        <button
          onClick={onDryRun}
          disabled={sending || validCount === 0}
          className="rounded-md border border-wa-teal px-4 py-2 text-sm font-medium text-wa-teal disabled:opacity-50"
        >
          Simular (dry run)
        </button>
        {!sending ? (
          <button
            onClick={onSend}
            disabled={validCount === 0}
            className="rounded-md bg-wa-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            🚀 Disparar {validCount} mensagens
          </button>
        ) : (
          <button
            onClick={onStop}
            className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white"
          >
            ⏹ Parar
          </button>
        )}
        {done > 0 && (
          <button
            onClick={onDownload}
            className="ml-auto rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600"
          >
            ⬇ Baixar relatório (CSV)
          </button>
        )}
      </div>
    </Card>
  );
}

function StatusPill({
  status,
  error,
}: {
  status: string;
  error?: string;
}) {
  const map: Record<string, string> = {
    sent: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    skipped: "bg-yellow-100 text-yellow-700",
    invalid: "bg-red-50 text-red-500",
    pending: "bg-gray-100 text-gray-400",
  };
  const labels: Record<string, string> = {
    sent: "enviado",
    failed: "falhou",
    skipped: "pulado",
    invalid: "inválido",
    pending: "aguardando",
  };
  return (
    <span
      title={error}
      className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? map.pending}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="mt-6 flex justify-between">
      <button
        onClick={onBack}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600"
      >
        ← Voltar
      </button>
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-md bg-wa-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        Continuar →
      </button>
    </div>
  );
}
