import { createHash } from "node:crypto";
import type { FotoEnviada } from "./recomendar";
import { FOTOS_MAX, FOTO_BYTES_MAX } from "./tipos";

// ============================================================================
//  Fotos enviadas: validadas aqui, mantidas só em memória, nunca gravadas
// ============================================================================
export async function lerFotos(
  entradas: FormDataEntryValue[],
): Promise<{ ok: true; fotos: FotoEnviada[] } | { ok: false; message: string }> {
  const arquivos = entradas.filter((e): e is File => typeof e !== "string");
  if (arquivos.length > FOTOS_MAX) {
    return { ok: false, message: `Envie no máximo ${FOTOS_MAX} fotos.` };
  }

  const fotos: FotoEnviada[] = [];
  for (const arquivo of arquivos) {
    if (arquivo.size > FOTO_BYTES_MAX) {
      return { ok: false, message: "Uma das fotos é grande demais. Tente de novo." };
    }
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    // Pelo conteúdo, não pela extensão nem pelo tipo que o navegador declarou.
    const mediaType = tipoPelosBytes(bytes);
    if (!mediaType) {
      return { ok: false, message: "Formato de foto não aceito. Use JPEG, PNG ou WebP." };
    }
    fotos.push({
      mediaType,
      base64: bytes.toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return { ok: true, fotos };
}

export function tipoPelosBytes(b: Buffer): FotoEnviada["mediaType"] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}
