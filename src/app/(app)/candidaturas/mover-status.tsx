"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { mudarStatus } from "@/app/actions";
import { STATUS, STATUS_LABEL, type Status } from "@/lib/tipos";

export function MoverStatus({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <select
      aria-label="Mover para"
      className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
      value={status}
      disabled={pendente}
      onChange={(e) =>
        iniciar(async () => {
          await mudarStatus({ id, status: e.target.value as Status, resultado: null });
          router.refresh();
        })
      }
    >
      {STATUS.map((s) => <option key={s} value={s}>Mover para: {STATUS_LABEL[s]}</option>)}
    </select>
  );
}
