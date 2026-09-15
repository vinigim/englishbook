"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Block, BlockPeriod, BlockReason, Equipment, Rental } from "../types";
import { fmtBRL, fmtDayHeading, minutes, todayStr, whatsAppUrl } from "../shared";
import { deleteRental, deleteBlock } from "../actions";
import { RentalModal } from "./RentalModal";
import { BlockModal } from "./BlockModal";

const PERIOD_LABEL: Record<BlockPeriod, string> = {
  full: "Dia todo",
  morning: "Manhã",
  afternoon: "Tarde",
};

const REASON_LABEL: Record<BlockReason, string> = {
  patient: "Com paciente",
  locacao: "Para locação",
};

type DayEntry = { rentals: Rental[]; blocks: Block[] };

export function AgendaClient({
  equipment,
  rentals,
  blocks,
}: {
  equipment: Equipment[];
  rentals: Rental[];
  blocks: Block[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterEquip, setFilterEquip] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Rental | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);

  const equipMap = useMemo(
    () => new Map(equipment.map((e) => [e.id, e])),
    [equipment]
  );
  const today = todayStr();

  const stats = useMemo(() => {
    const upcoming = rentals.filter((r) => r.date >= today);
    const todays = rentals.filter((r) => r.date === today);
    const revenue = upcoming.reduce((s, r) => s + (r.price || 0), 0);
    return {
      todays: todays.length,
      upcoming: upcoming.length,
      equip: equipment.length,
      revenue,
    };
  }, [rentals, equipment, today]);

  const days = useMemo(() => {
    const q = search.toLowerCase().trim();
    const map = new Map<string, DayEntry>();
    const ensure = (d: string) => {
      let e = map.get(d);
      if (!e) {
        e = { rentals: [], blocks: [] };
        map.set(d, e);
      }
      return e;
    };

    let rItems = rentals.slice();
    if (!showPast) rItems = rItems.filter((r) => r.date >= today);
    if (filterEquip) rItems = rItems.filter((r) => r.equip_id === filterEquip);
    if (q)
      rItems = rItems.filter((r) => {
        const eq = r.equip_id ? equipMap.get(r.equip_id) : null;
        return [r.client, r.address, r.notes, r.phone, eq?.name]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
    for (const r of rItems) ensure(r.date).rentals.push(r);

    let bItems = blocks.slice();
    if (!showPast) bItems = bItems.filter((b) => b.date >= today);
    if (filterEquip) bItems = bItems.filter((b) => b.equip_id === filterEquip);
    if (q)
      bItems = bItems.filter((b) => {
        const eq = b.equip_id ? equipMap.get(b.equip_id) : null;
        return [b.note, eq?.name, "fechada", "fechamento"]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
    for (const b of bItems) ensure(b.date).blocks.push(b);

    for (const e of map.values())
      e.rentals.sort((a, b) => minutes(a.start_time) - minutes(b.start_time));

    return map;
  }, [rentals, blocks, search, filterEquip, showPast, today, equipMap]);

  const orderedDates = useMemo(() => [...days.keys()].sort(), [days]);

  function openNew() {
    if (equipment.length === 0) {
      router.push("/derma-lux/equipamentos");
      return;
    }
    setEditing(null);
    setModalOpen(true);
  }
  function openBlock() {
    if (equipment.length === 0) {
      router.push("/derma-lux/equipamentos");
      return;
    }
    setBlockModalOpen(true);
  }
  function openEdit(r: Rental) {
    setEditing(r);
    setModalOpen(true);
  }
  async function handleDelete(r: Rental) {
    if (!confirm(`Remover o aluguel de "${r.client}"?`)) return;
    const res = await deleteRental(r.id);
    if (!res.ok) {
      alert(res.error ?? "Não foi possível remover.");
      return;
    }
    router.refresh();
  }
  async function handleDeleteBlock(b: Block) {
    if (!confirm("Reabrir a agenda deste dia (remover o fechamento)?")) return;
    const res = await deleteBlock(b.id);
    if (!res.ok) {
      alert(res.error ?? "Não foi possível reabrir.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            Próximas obrigações de aluguel
          </h1>
          <p className="text-muted mt-1">
            Aluguéis e fechamentos de agenda, organizados por data.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openBlock}
            className="h-11 px-5 bg-paper text-ink border border-ink font-medium hover:bg-ink hover:text-paper transition-colors"
          >
            Fechar agenda
          </button>
          <button
            onClick={openNew}
            className="h-11 px-6 bg-ink text-paper font-medium hover:bg-accent transition-colors"
          >
            + Novo aluguel
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <Stat k="Aluguéis hoje" v={String(stats.todays)} />
        <Stat k="Próximos aluguéis" v={String(stats.upcoming)} />
        <Stat k="Equipamentos" v={String(stats.equip)} />
        <Stat
          k="A receber (futuro)"
          v={stats.revenue ? fmtBRL(stats.revenue) : "—"}
          small
        />
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, endereço ou equipamento…"
          className="h-11 px-3 bg-paper border border-line text-ink placeholder:text-muted focus:outline-none focus:border-ink transition-colors w-full sm:w-80"
        />
        <select
          value={filterEquip}
          onChange={(e) => setFilterEquip(e.target.value)}
          className="h-11 px-3 bg-paper border border-line text-ink focus:outline-none focus:border-ink transition-colors"
        >
          <option value="">Todos os equipamentos</option>
          {equipment.map((eq) => (
            <option key={eq.id} value={eq.id}>
              {eq.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPast}
            onChange={(e) => setShowPast(e.target.checked)}
          />
          Mostrar passados
        </label>
      </div>

      {/* Lista */}
      {orderedDates.length === 0 ? (
        <div className="text-center py-20 text-muted border border-dashed border-line">
          <div className="text-5xl mb-3">📅</div>
          <p className="font-display text-xl text-ink mb-1">
            Nada {showPast ? "" : "futuro "}encontrado
          </p>
          <p>Use “+ Novo aluguel” ou “Fechar agenda” para começar.</p>
        </div>
      ) : (
        orderedDates.map((date) => {
          const heading = fmtDayHeading(date);
          const isToday = date === today;
          const isPast = date < today;
          const entry = days.get(date)!;
          return (
            <section key={date} className="mb-8">
              <div className="flex items-baseline gap-3 border-b border-dashed border-line pb-2 mb-3">
                <span className="font-display text-lg tracking-tight">
                  {heading.day}
                </span>
                <span className="text-sm text-muted capitalize">
                  {heading.dow}
                </span>
                {isToday ? (
                  <span className="text-xs font-bold uppercase bg-accent text-paper px-2 py-0.5">
                    Hoje
                  </span>
                ) : null}
                <span className="ml-auto text-sm text-muted">
                  {entry.rentals.length > 0
                    ? `${entry.rentals.length} aluguel(éis)`
                    : ""}
                  {entry.rentals.length > 0 && entry.blocks.length > 0 ? " · " : ""}
                  {entry.blocks.length > 0
                    ? `${entry.blocks.length} fechamento(s)`
                    : ""}
                </span>
              </div>

              <div className="space-y-2.5">
                {entry.rentals.map((r) => {
                  const eq = r.equip_id ? equipMap.get(r.equip_id) : null;
                  const wa = whatsAppUrl(r, eq?.name ?? null);
                  return (
                    <div
                      key={r.id}
                      className={`flex items-center gap-4 p-4 border border-line bg-paper ${
                        isPast ? "opacity-60" : ""
                      }`}
                    >
                      <div className="min-w-[104px] text-center px-2 py-2 bg-line/60 font-semibold text-sm leading-tight">
                        {r.start_time}
                        <span className="block text-xs text-muted font-medium">
                          até {r.end_time}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{r.client}</p>
                        <div className="text-sm text-muted flex gap-x-4 gap-y-0.5 flex-wrap mt-0.5">
                          {r.specialty ? <span>🩺 {r.specialty}</span> : null}
                          <span>📍 {r.address}</span>
                          {r.phone ? <span>📞 {r.phone}</span> : null}
                          {r.price != null ? (
                            <span>💰 {fmtBRL(r.price)}</span>
                          ) : null}
                          {r.tips_used ? (
                            <span>🔧 Ponteiras: {r.tips_used}</span>
                          ) : null}
                          {r.sterilized != null ? (
                            <span>
                              🧼 Esterilização: {r.sterilized ? "Sim" : "Não"}
                            </span>
                          ) : null}
                          {r.specialized_technique != null ? (
                            <span>
                              🎯 Técnica especializada:{" "}
                              {r.specialized_technique ? "Sim" : "Não"}
                            </span>
                          ) : null}
                          {r.notes ? <span>📝 {r.notes}</span> : null}
                        </div>
                      </div>

                      {eq ? (
                        <span
                          className="px-2.5 py-1 text-xs font-semibold text-paper whitespace-nowrap"
                          style={{ backgroundColor: eq.color }}
                        >
                          {eq.name}
                        </span>
                      ) : null}

                      <div className="flex items-center gap-1 shrink-0">
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-[#25D366] hover:bg-line transition-colors"
                            title="Enviar confirmação no WhatsApp"
                            aria-label="Enviar confirmação no WhatsApp"
                          >
                            💬
                          </a>
                        ) : null}
                        <button
                          onClick={() => openEdit(r)}
                          className="p-2 text-muted hover:text-ink hover:bg-line transition-colors"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          className="p-2 text-muted hover:text-accent hover:bg-line transition-colors"
                          title="Remover"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}

                {entry.blocks.map((b) => {
                  const eq = b.equip_id ? equipMap.get(b.equip_id) : null;
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center gap-4 p-4 border border-dashed border-line bg-line/25 ${
                        isPast ? "opacity-60" : ""
                      }`}
                    >
                      <div className="min-w-[104px] text-center px-2 py-2 bg-ink/80 text-paper font-semibold text-sm leading-tight">
                        🚫
                        <span className="block text-xs font-medium">
                          {PERIOD_LABEL[b.period]}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">
                          Agenda fechada — {PERIOD_LABEL[b.period].toLowerCase()}
                        </p>
                        <div className="text-sm text-muted mt-0.5">
                          {REASON_LABEL[b.reason]}
                          {b.note ? ` · ${b.note}` : ""}
                        </div>
                      </div>

                      {eq ? (
                        <span
                          className="px-2.5 py-1 text-xs font-semibold text-paper whitespace-nowrap"
                          style={{ backgroundColor: eq.color }}
                        >
                          {eq.name}
                        </span>
                      ) : null}

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleDeleteBlock(b)}
                          className="p-2 text-muted hover:text-ink hover:bg-line transition-colors"
                          title="Reabrir (remover fechamento)"
                          aria-label="Reabrir agenda"
                        >
                          ↩️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      <RentalModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        equipment={equipment}
        rentals={rentals}
        initial={editing}
      />
      <BlockModal
        open={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        equipment={equipment}
      />
    </div>
  );
}

function Stat({ k, v, small }: { k: string; v: string; small?: boolean }) {
  return (
    <div className="border border-line bg-paper p-4">
      <p className="text-xs text-muted uppercase tracking-wide font-bold">{k}</p>
      <p className={`font-display tracking-tight mt-1 ${small ? "text-xl" : "text-3xl"}`}>
        {v}
      </p>
    </div>
  );
}
