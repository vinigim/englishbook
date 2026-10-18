"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function BotaoSair() {
  const router = useRouter();
  return (
    <button
      className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login");
      }}
    >
      Sair
    </button>
  );
}
