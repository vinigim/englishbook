"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Equipment, Rental } from "../types";
import { PALETTE, todayStr } from "../shared";
import { deleteEquipment } from "../actions";
import { EquipModal } from "./EquipModal";

export function EquipamentosClient({
  equipment,
  rentals,
}: {
  equipment: Equipment[];
  rentals: Rental[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const today = todayStr();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rentals) {
      if (r.equip_id && r.date >= today) {
        map.set(r.equip_id, (map.get(r.equip_id) ?? 0) + 1);
      }
    }
    return map;
  }, [rentals, today]);

  const defaultColor = PALETTE[equipment.length % PALETTE.length];

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(e: Equipment) {
    setEditing(e);
    setModalOpen(true);
  }
  async function handleDelete(e: Equipment) {
    const count = rentals.filter((r) => r.equip_id === e.id).length;
    const msg =
      count > 0
        ? `O laser "${e.name}" tem ${count} aluguel(éis) agendado(s). Remover o equipamento também removerá esses aluguéis. Continuar?`
        : `Remover o equipamento "${e.name}"?`;
    if (!confirm(msg)) return;
    const res = await deleteEquipment(e.id);
    if (!res.ok) {
      alert(res.error ?? "Não foi possível remover.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-display text-3xl tracking-tight">
            Meus equipamentos
          </h1>
          <p className="text-muted mt-1">Cadastre os lasers que você aluga.</p>
        </div>
        <button
          onClick={openNew}
          className="h-11 px-6 bg-ink text-paper font-medium hover:bg-accent transition-colors"
        >
          + Novo equipamento
        </button>
      </div>

      {equipment.length === 0 ? (
        <div className="text-center py-20 text-muted border border-dashed border-line">
          <div className="text-5xl mb-3">🔬</div>
          <p className="font-display text-xl text-ink mb-1">
            Nenhum equipamento cadastrado
          </p>
          <p>Clique em “+ Novo equipamento” para começar.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {equipment.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-4 p-4 border border-line bg-paper"
            >
              <div
                className="w-7 h-7 shrink-0"
                style={{ backgroundColor: e.color }}
              />
              <div>
                <p className="font-semibold">{e.name}</p>
                {e.use ? (
                  <p className="text-sm text-muted">{e.use}</p>
                ) : null}
              </div>
              <div className="flex-1" />
              <span className="text-xs font-medium bg-line px-2.5 py-1">
                {counts.get(e.id) ?? 0} próximos
              </span>
              <button
                onClick={() => openEdit(e)}
                className="p-2 text-muted hover:text-ink hover:bg-line transition-colors"
                title="Editar"
              >
                ✏️
              </button>
              <button
                onClick={() => handleDelete(e)}
                className="p-2 text-muted hover:text-accent hover:bg-line transition-colors"
                title="Remover"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      <EquipModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editing}
        defaultColor={defaultColor}
      />
    </div>
  );
}
