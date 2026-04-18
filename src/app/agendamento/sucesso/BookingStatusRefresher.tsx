"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Monta um intervalo que chama router.refresh() até o booking sair
 * de pending_payment. Para depois de 30 tentativas (60s) por segurança.
 */
export function BookingStatusRefresher({
  stillPending,
}: {
  stillPending: boolean;
}) {
  const router = useRouter();
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!stillPending) return;
    const id = setInterval(() => {
      attemptsRef.current += 1;
      if (attemptsRef.current > 30) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [stillPending, router]);

  return null;
}
