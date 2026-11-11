import { ManuseioClient } from "./ManuseioClient";

export const metadata = {
  title: "Manuseio do laser — Lux Derma",
};

export default function ManuseioPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-ink tracking-tight">
          Manuseio do laser
        </h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">
          Roteiros para instalar e desinstalar o SmartXide Punto na clínica.
          Toque em cada passo ao concluir: o progresso fica salvo neste
          aparelho até você recomeçar.
        </p>
      </div>
      <ManuseioClient />
    </div>
  );
}
