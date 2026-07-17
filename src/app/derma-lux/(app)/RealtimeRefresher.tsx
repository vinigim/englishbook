"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Assina as mudanças nas tabelas do Derma Lux e atualiza a tela em tempo real,
 * para que aluguéis criados/editados em outro aparelho apareçam aqui na hora.
 */
export function RealtimeRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase
      .channel("derma-lux-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dl_rentals" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dl_equipment" },
        refresh
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
