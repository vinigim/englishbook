"use client";

import { useMemo, useState } from "react";
import type { Equipment, Rental } from "../types";
import { fmtMin, minutes, overlaps, todayStr } from "../shared";
import { RentalModal, type RentalPrefill } from "./RentalModal";

export function AvailabilityClient({
  equipment,
  rentals,
}: {
  equipment: Equipment[];
  rentals: Rental[];
}) {
  const [equipId, setEquipId] = useState(equipment[0]?.id ?? "");
  const [date, setDate] = useState(todayStr());
  const [step, setStep] = useState(60);
  const [open, setOpen] = useState("08:00");
  const [close, setClose] = useState("20:00");
  const [modalOpen, setModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<RentalPrefill | undefined>(undefined);

  const dayRentals = useMemo(
    () => rentals.filter((r) => r.equip_id === equipId && r.date === date),
    [rentals, equipId, date]
  );

  const slots = useMemo(() => {
    const openM = minutes(open || "08:00");
    const closeM = minutes(close || "20:00");
    const out: { start: number; end: number; busy: Rental | null }[] = [];
    for (let t = openM; t + step <= closeM; t += step) {
      const end = t + step;
      const busy =
        dayRentals.find((r) =>
          overlaps(t, end, minutes(r.start_time), minutes(r.end_time))
        ) ?? null;
      out.push({ start: t, end, busy });
    }
    return out;
  }, [open, close, step, dayRentals]);

  function bookSlot(startM: number, endM: number) {
    setPrefill({
      date,
      equip_id: equipId,
      start_time: fmtMin(startM),
      end_time: fmtMin(endM),
    });
    setModalOpen(true);
  }

  return (
    <div>
      <h1 className="font-display text-3xl tracking-tight">Horários disponíveis</h1>
      <p className="text-muted mt-1 mb-6">
        Escolha o equipamento e a data para ver, num relance, os horários livres e
        ocupados.
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
          <div className="border border-line bg-paper p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Equipamento (laser)">
              <select
                className={inputCls}
                value={equipId}
                onChange={(e) => setEquipId(e.target.value)}
              >
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Data">
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Duração do bloco">
              <select
                className={inputCls}
                value={step}
                onChange={(e) => setStep(Number(e.target.value))}
              >
                <option value={60}>1 hora</option>
                <option value={30}>30 minutos</option>
                <option value={120}>2 horas</option>
              </select>
            </Field>
            <Field label="Abertura">
              <input
                type="time"
                className={inputCls}
                value={open}
                onChange={(e) => setOpen(e.target.value)}
              />
            </Field>
            <Field label="Fechamento">
              <input
                type="time"
                className={inputCls}
                value={close}
                onChange={(e) => setClose(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex gap-5 text-sm text-muted mb-4 flex-wrap">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 inline-block bg-ink" /> Livre — clique para
              agendar
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 inline-block bg-accent" /> Ocupado
            </span>
          </div>

          {slots.length === 0 ? (
            <p className="text-muted">Ajuste os horários de abertura/fechamento.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2.5">
              {slots.map((s) =>
                s.busy ? (
                  <div
                    key={s.start}
                    className="p-3 text-center border border-accent bg-accent/10 text-accent font-semibold text-sm cursor-not-allowed"
                    title={`Ocupado: ${s.busy.client}`}
                  >
                    {fmtMin(s.start)}
                    <span className="block text-xs font-medium truncate">
                      {s.busy.client}
                    </span>
                  </div>
                ) : (
                  <button
                    key={s.start}
                    onClick={() => bookSlot(s.start, s.end)}
                    className="p-3 text-center border border-ink/30 bg-paper hover:bg-ink hover:text-paper transition-colors font-semibold text-sm"
                    title={`Livre — clique para agendar ${fmtMin(s.start)}–${fmtMin(
                      s.end
                    )}`}
                  >
                    {fmtMin(s.start)}
                    <span className="block text-xs font-medium">livre</span>
                  </button>
                )
              )}
            </div>
          )}
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

const inputCls =
  "w-full h-11 px-3 bg-paper border border-line text-ink focus:outline-none focus:border-ink transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink mb-1.5 tracking-tight">
        {label}
      </span>
      {children}
    </label>
  );
}
