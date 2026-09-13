"use client";

import { useMemo, useState } from "react";
import type { Equipment, Rental } from "../types";
import { RentalModal, type RentalPrefill } from "./RentalModal";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const DAYS = 30;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function toStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Cell = {
  date: Date;
  str: string;
  inWindow: boolean;
  occupied: boolean;
  isToday: boolean;
};

export function AvailabilityClient({
  equipment,
  rentals,
}: {
  equipment: Equipment[];
  rentals: Rental[];
}) {
  const [equipId, setEquipId] = useState(equipment[0]?.id ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<RentalPrefill | undefined>(undefined);

  const equip = equipment.find((e) => e.id === equipId) ?? null;

  const occupied = useMemo(() => {
    const s = new Set<string>();
    for (const r of rentals) if (r.equip_id === equipId) s.add(r.date);
    return s;
  }, [rentals, equipId]);

  const { weeks, availableCount, periodLabel } = useMemo(() => {
    const start = startOfToday();
    const end = addDays(start, DAYS - 1);
    const startStr = toStr(start);
    const endStr = toStr(end);
    const todayStr = startStr;

    const gridStart = addDays(start, -start.getDay());
    const gridEnd = addDays(end, 6 - end.getDay());

    const cells: Cell[] = [];
    let available = 0;
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
      const str = toStr(d);
      const inWindow = str >= startStr && str <= endStr;
      const isOcc = occupied.has(str);
      if (inWindow && !isOcc) available++;
      cells.push({
        date: d,
        str,
        inWindow,
        occupied: isOcc,
        isToday: str === todayStr,
      });
    }

    const weeksArr: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeksArr.push(cells.slice(i, i + 7));

    const label = `${start.getDate()} ${MONTHS_ABBR[start.getMonth()]} – ${end.getDate()} ${MONTHS_ABBR[end.getMonth()]}`;

    return { weeks: weeksArr, availableCount: available, periodLabel: label };
  }, [occupied]);

  function bookDay(str: string) {
    setPrefill({ date: str, equip_id: equipId });
    setModalOpen(true);
  }

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">
        Dias disponíveis
      </h1>
      <p className="text-muted mt-1 mb-6">
        Próximos 30 dias do equipamento. Tire um print e envie os dias livres
        pelo WhatsApp.
      </p>

      {equipment.length === 0 ? (
        <div className="text-center py-20 text-muted border border-dashed border-line">
          <div className="text-5xl mb-3">🔬</div>
          <p className="font-display text-xl text-ink mb-1">
            Nenhum equipamento cadastrado
          </p>
          <p>Cadastre um laser na aba Equipamentos.</p>
        </div>
      ) : (
        <>
          <label className="block mb-5 max-w-sm">
            <span className="block text-sm font-medium text-ink mb-1.5 tracking-tight">
              Equipamento (laser)
            </span>
            <select
              className="w-full h-11 px-3 bg-paper border border-line text-ink focus:outline-none focus:border-ink transition-colors"
              value={equipId}
              onChange={(e) => setEquipId(e.target.value)}
            >
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </label>

          {/* Cartão para print */}
          <div className="border border-line bg-paper shadow-[4px_4px_0_0_rgba(26,26,26,0.06)] p-5 max-w-2xl">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 bg-accent text-paper grid place-items-center font-display text-base font-semibold shrink-0">
                DL
              </div>
              <div className="min-w-0">
                <p className="font-display text-xl tracking-tight leading-tight truncate">
                  {equip?.name ?? "—"}
                </p>
                <p className="text-sm text-muted">Disponibilidade · {periodLabel}</p>
              </div>
            </div>

            <p className="text-sm mb-4">
              <span className="font-semibold text-[#2f6f4f]">
                {availableCount}
              </span>{" "}
              <span className="text-muted">
                {availableCount === 1 ? "dia disponível" : "dias disponíveis"} nos
                próximos 30 dias
              </span>
            </p>

            {/* Cabeçalho dos dias da semana */}
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="text-center text-[11px] font-bold uppercase tracking-wide text-muted"
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Semanas */}
            <div className="space-y-1.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1.5">
                  {week.map((c) => {
                    if (!c.inWindow) {
                      return <div key={c.str} className="aspect-square" />;
                    }
                    const base =
                      "aspect-square rounded-md flex flex-col items-center justify-center leading-none select-none";
                    if (c.occupied) {
                      return (
                        <div
                          key={c.str}
                          className={`${base} bg-line/60 text-muted`}
                          title="Alugado"
                        >
                          <span className="text-base font-semibold line-through decoration-1">
                            {c.date.getDate()}
                          </span>
                          <span className="text-[9px] mt-0.5">
                            {MONTHS_ABBR[c.date.getMonth()]}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={c.str}
                        type="button"
                        onClick={() => bookDay(c.str)}
                        title="Disponível — toque para agendar"
                        className={`${base} bg-[#2f6f4f] text-white hover:brightness-110 transition ${
                          c.isToday ? "ring-2 ring-accent ring-offset-1 ring-offset-paper" : ""
                        }`}
                      >
                        <span className="text-base font-bold">
                          {c.date.getDate()}
                        </span>
                        <span className="text-[9px] mt-0.5 opacity-90">
                          {MONTHS_ABBR[c.date.getMonth()]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legenda */}
            <div className="flex gap-5 text-xs text-muted mt-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-[#2f6f4f] inline-block" />
                Disponível
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-line inline-block" />
                Alugado
              </span>
            </div>
          </div>

          <p className="text-xs text-muted mt-3">
            Dica: toque num dia verde para já criar um aluguel nele.
          </p>
        </>
      )}

      <RentalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        equipment={equipment}
        rentals={rentals}
        prefill={prefill}
      />
    </div>
  );
}
