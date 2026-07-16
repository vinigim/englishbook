import * as XLSX from "xlsx";
import type { ContactRow, DetectedColumn, ParseResult } from "./types";
import { detectRole, looksLikePhoneColumn } from "./columns";

/**
 * Faz o parsing de um arquivo .csv / .xlsx / .xls (como ArrayBuffer) e
 * devolve linhas + colunas com o papel de cada uma detectado.
 *
 * Assume que a primeira linha da planilha é o cabeçalho.
 */
export function parseSpreadsheet(buffer: ArrayBuffer): ParseResult {
  const workbook = readWorkbook(buffer);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { columns: [], rows: [], nameColumn: null, phoneColumn: null, totalRows: 0 };
  }

  const sheet = workbook.Sheets[firstSheetName];

  // header:1 -> matriz de arrays; assim controlamos os cabeçalhos manualmente.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });

  if (matrix.length === 0) {
    return { columns: [], rows: [], nameColumn: null, phoneColumn: null, totalRows: 0 };
  }

  const rawHeaders = matrix[0].map((h, i) => {
    const label = String(h ?? "").trim();
    return label || `Coluna ${i + 1}`;
  });

  // Garante cabeçalhos únicos (planilhas às vezes repetem).
  const headers = dedupeHeaders(rawHeaders);

  const dataRows = matrix.slice(1);
  const rows: ContactRow[] = dataRows
    .map((cells) => {
      const row: ContactRow = {};
      headers.forEach((header, i) => {
        row[header] = String(cells[i] ?? "").trim();
      });
      return row;
    })
    // descarta linhas totalmente vazias
    .filter((row) => Object.values(row).some((v) => v !== ""));

  const columns: DetectedColumn[] = headers.map((header) => {
    const sample = rows
      .map((r) => r[header])
      .filter((v) => v !== "")
      .slice(0, 5);

    let role = detectRole(header);
    // Se o nome não denunciou telefone, tentamos pelo conteúdo.
    if (role === "custom") {
      const allValues = rows.map((r) => r[header]);
      if (looksLikePhoneColumn(allValues)) role = "phone";
    }

    return { header, role, sample };
  });

  const phoneColumn = columns.find((c) => c.role === "phone")?.header ?? null;
  const nameColumn = columns.find((c) => c.role === "name")?.header ?? null;

  return {
    columns,
    rows,
    nameColumn,
    phoneColumn,
    totalRows: rows.length,
  };
}

/**
 * Lê o workbook respeitando a codificação. Planilhas xlsx (ZIP: "PK") e xls
 * (OLE) são binárias e vão como array. CSV/texto é decodificado como UTF-8
 * explicitamente — senão o SheetJS assume codepage 1252 e acentos viram
 * mojibake ("João" -> "JoÃ£o").
 */
function readWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK" -> xlsx
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf; // OLE -> xls

  if (isZip || isOle) {
    return XLSX.read(buffer, { type: "array" });
  }

  // Texto (CSV): decodifica UTF-8 e remove BOM se houver.
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return XLSX.read(text, { type: "string" });
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const count = seen.get(h) ?? 0;
    seen.set(h, count + 1);
    return count === 0 ? h : `${h} (${count + 1})`;
  });
}
