"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Badge";
import { Label } from "@/components/ui/Input";
import {
  FOTOS_MAX,
  FOTO_BYTES_MAX,
  FOTO_LADO_MAX,
  type AnaliseFoto,
} from "@/lib/laser/tipos";

/** Foto pronta para enviar: já comprimida, só na memória do navegador. */
export type FotoLocal = { id: string; blob: Blob; url: string };

/**
 * Reduz a foto a no máximo 1568 px no lado maior, em JPEG.
 *
 * Foto de celular tem 3–5 MB e 4000 px; o modelo reduz para ~1568 px de
 * qualquer jeito, então mandar maior só gasta upload e tokens. Também tira os
 * metadados (EXIF com GPS e data), porque o canvas não os copia.
 */
async function comprimir(arquivo: File): Promise<Blob> {
  const imagem = await carregar(arquivo);
  const escala = Math.min(1, FOTO_LADO_MAX / Math.max(imagem.width, imagem.height));
  const largura = Math.round(imagem.width * escala);
  const altura = Math.round(imagem.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.drawImage(imagem, 0, 0, largura, altura);

  for (const qualidade of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((ok) =>
      canvas.toBlob(ok, "image/jpeg", qualidade),
    );
    if (blob && blob.size <= FOTO_BYTES_MAX) return blob;
  }
  throw new Error("foto grande demais mesmo comprimida");
}

/** createImageBitmap respeita a orientação do EXIF; o <img> é o plano B. */
async function carregar(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export function CampoFotos({
  fotos,
  setFotos,
}: {
  fotos: FotoLocal[];
  setFotos: (f: (atual: FotoLocal[]) => FotoLocal[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const cabem = FOTOS_MAX - fotos.length;

  async function adicionar(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setErro(null);
    setProcessando(true);
    const novas: FotoLocal[] = [];
    try {
      for (const arquivo of Array.from(lista).slice(0, cabem)) {
        try {
          const blob = await comprimir(arquivo);
          novas.push({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) });
        } catch {
          setErro(`Não deu para abrir "${arquivo.name}". Tente tirar a foto de novo.`);
        }
      }
      if (lista.length > cabem) {
        setErro(`Cabem ${FOTOS_MAX} fotos por consulta; as excedentes ficaram de fora.`);
      }
      setFotos((atual) => [...atual, ...novas]);
    } finally {
      setProcessando(false);
      if (input.current) input.current.value = "";
    }
  }

  function remover(id: string) {
    setFotos((atual) => {
      const saindo = atual.find((f) => f.id === id);
      if (saindo) URL.revokeObjectURL(saindo.url);
      return atual.filter((f) => f.id !== id);
    });
  }

  return (
    <div className="space-y-2">
      <Label>Fotos da área (opcional)</Label>
      <ul className="text-xs text-muted list-disc list-inside space-y-0.5">
        <li>Pele limpa, sem maquiagem, luz uniforme.</li>
        <li>Uma de frente e uma de lado.</li>
        <li>Cicatriz: uma com luz vindo de lado, para mostrar o relevo.</li>
        <li>Enquadre só a área; evite os olhos quando não forem a área tratada.</li>
      </ul>

      {fotos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {fotos.map((f, i) => (
            <div key={f.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob local, sem otimização */}
              <img
                src={f.url}
                alt={`Foto ${i + 1}`}
                className="w-20 h-20 object-cover border border-line"
              />
              <button
                type="button"
                onClick={() => remover(f.id)}
                aria-label={`Remover foto ${i + 1}`}
                className="absolute -top-2 -right-2 w-6 h-6 bg-ink text-paper text-xs leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {cabem > 0 ? (
        <label className="inline-flex items-center gap-2 h-9 px-4 border border-ink text-sm text-ink cursor-pointer hover:bg-ink hover:text-paper transition-colors">
          {processando ? "Preparando…" : fotos.length ? "Adicionar outra foto" : "Adicionar fotos"}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={processando}
            onChange={(e) => adicionar(e.target.files)}
          />
        </label>
      ) : null}

      <p className="text-[11px] text-muted">
        As fotos vão só para a análise e são descartadas: não ficam gravadas no
        sistema. Fica gravado apenas o texto do que a IA observou.
      </p>
      {erro ? <p className="text-xs text-accent">{erro}</p> : null}
    </div>
  );
}

/** O que a IA viu nas fotos, no resultado. */
export function AnaliseFotoCard({ analise }: { analise: AnaliseFoto }) {
  return (
    <div className="space-y-3">
      {analise.divergencias.length > 0 ? (
        <Alert variant="warning" title="A foto não bate com o formulário">
          <ul className="list-disc list-inside space-y-1">
            {analise.divergencias.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <div className="border border-line p-4 text-sm space-y-2">
        <h3 className="font-display text-lg text-ink tracking-tight">O que a foto mostra</h3>
        <ul className="list-disc list-inside space-y-1 text-ink">
          {analise.achados.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        {analise.limitacoes.length > 0 ? (
          <p className="text-xs text-muted">
            Limites da foto: {analise.limitacoes.join(" ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
