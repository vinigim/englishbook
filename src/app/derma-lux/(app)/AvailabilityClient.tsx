"use client";

import { useMemo, useState } from "react";
import type { Block, BlockPeriod, Equipment, Rental } from "../types";
import { RentalModal, type RentalPrefill } from "./RentalModal";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const DAYS = 30;

// Cores por status
const C_AVAILABLE = "#2f6f4f"; // verde
const C_FULL = "#374151"; // cinza-escuro
const C_MORNING = "#b0851f"; // âmbar
const C_AFTERNOON = "#3b5b8c"; // azul

type Status =
  | "available"
  | "rented"
  | "full"
  | "avail_morning"
  | "avail_afternoon";

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
  status: Status;
  isToday: boolean;
};

export function AvailabilityClient({
  equipment,
  rentals,
  blocks,
}: {
  equipment: Equipment[];
  rentals: Rental[];
  blocks: Block[];
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

  const blocksByDate = useMemo(() => {
    const m = new Map<string, Set<BlockPeriod>>();
    for (const b of blocks) {
      if (b.equip_id !== equipId) continue;
      let set = m.get(b.date);
      if (!set) {
        set = new Set();
        m.set(b.date, set);
      }
      set.add(b.period);
    }
    return m;
  }, [blocks, equipId]);

  const { weeks, availableCount, periodLabel } = useMemo(() => {
    const start = startOfToday();
    const end = addDays(start, DAYS - 1);
    const startStr = toStr(start);
    const endStr = toStr(end);

    const gridStart = addDays(start, -start.getDay());
    const gridEnd = addDays(end, 6 - end.getDay());

    const cells: Cell[] = [];
    let available = 0;
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) {
      const str = toStr(d);
      const inWindow = str >= startStr && str <= endStr;

      let status: Status = "available";
      if (inWindow) {
        const periods = blocksByDate.get(str);
        const closedFull =
          !!periods &&
          (periods.has("full") ||
            (periods.has("morning") && periods.has("afternoon")));
        if (closedFull) status = "full";
        else if (occupied.has(str)) status = "rented";
        else if (periods?.has("morning"))
          status = "avail_afternoon"; // manhã fechada → tarde livre
        else if (periods?.has("afternoon"))
          status = "avail_morning"; // tarde fechada → manhã livre
        else status = "available";

        if (
          status === "available" ||
          status === "avail_morning" ||
          status === "avail_afternoon"
        )
          available++;
      }

      cells.push({ date: d, str, inWindow, status, isToday: str === startStr });
    }

    const weeksArr: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeksArr.push(cells.slice(i, i + 7));

    const label = `${start.getDate()} ${MONTHS_ABBR[start.getMonth()]} – ${end.getDate()} ${MONTHS_ABBR[end.getMonth()]}`;
    return { weeks: weeksArr, availableCount: available, periodLabel: label };
  }, [occupied, blocksByDate]);

  function bookDay(str: string) {
    setPrefill({ date: str, equip_id: equipId });
    setModalOpen(true);
  }

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Dias disponíveis</h1>
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
                <p className="text-sm text-muted">
                  Disponibilidade · {periodLabel}
                </p>
              </div>
            </div>

            <p className="text-sm mb-4">
              <span className="font-semibold" style={{ color: C_AVAILABLE }}>
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
                    if (!c.inWindow)
                      return <div key={c.str} className="aspect-square" />;

                    const base =
                      "aspect-square rounded-md flex flex-col items-center justify-center leading-none select-none";

                    if (c.status === "rented") {
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

                    if (c.status === "full") {
                      return (
                        <div
                          key={c.str}
                          className={`${base} text-white`}
                          style={{ backgroundColor: C_FULL }}
                          title="Agenda fechada (dia todo)"
                        >
                          <span className="text-base font-bold">
                            {c.date.getDate()}
                          </span>
                          <span className="text-[9px] mt-0.5 opacity-90">
                            {MONTHS_ABBR[c.date.getMonth()]}
                          </span>
                        </div>
                      );
                    }

                    // available, avail_morning, avail_afternoon → clicável
                    const color =
                      c.status === "avail_morning"
                        ? C_MORNING
                        : c.status === "avail_afternoon"
                        ? C_AFTERNOON
                        : C_AVAILABLE;
                    const small =
                      c.status === "avail_morning"
                        ? "manhã"
                        : c.status === "avail_afternoon"
                        ? "tarde"
                        : MONTHS_ABBR[c.date.getMonth()];
                    const title =
                      c.status === "avail_morning"
                        ? "Disponível de manhã — toque para agendar"
                        : c.status === "avail_afternoon"
                        ? "Disponível à tarde — toque para agendar"
                        : "Disponível — toque para agendar";
                    return (
                      <button
                        key={c.str}
                        type="button"
                        onClick={() => bookDay(c.str)}
                        title={title}
                        className={`${base} text-white hover:brightness-110 transition ${
                          c.isToday
                            ? "ring-2 ring-accent ring-offset-1 ring-offset-paper"
                            : ""
                        }`}
                        style={{ backgroundColor: color }}
                      >
                        <span className="text-base font-bold">
                          {c.date.getDate()}
                        </span>
                        <span className="text-[9px] mt-0.5 opacity-90">
                          {small}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legenda */}
            <div className="flex gap-x-4 gap-y-1.5 text-xs text-muted mt-4 flex-wrap">
              <Legend color={C_AVAILABLE} label="Disponível (dia todo)" />
              <Legend color={C_MORNING} label="Disponível de manhã" />
              <Legend color={C_AFTERNOON} label="Disponível à tarde" />
              <Legend color="#d9d4c9" label="Alugado" />
              <Legend color={C_FULL} label="Fechada (dia todo)" />
            </div>
          </div>

          <p className="text-xs text-muted mt-3">
            Dica: toque num dia verde para já criar um aluguel. Para fechar a
            agenda de um dia, use “Fechar agenda” na aba Agenda.
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-3.5 h-3.5 rounded inline-block"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
