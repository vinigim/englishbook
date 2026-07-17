import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DlLoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function DermaLuxLoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/derma-lux");

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-11 h-11 bg-accent text-paper grid place-items-center font-display text-xl font-semibold">
            DL
          </div>
          <div>
            <p className="font-display text-2xl tracking-tight leading-none">
              Derma Lux
            </p>
            <p className="text-sm text-muted">Agenda de aluguel de lasers</p>
          </div>
        </div>

        <div className="bg-paper border border-line shadow-[4px_4px_0_0_rgba(26,26,26,0.08)] p-8">
          <h1 className="font-display text-2xl tracking-tight mb-1">Entrar</h1>
          <p className="text-sm text-muted mb-6">
            Acesse a agenda da sua empresa.
          </p>
          <DlLoginForm />
        </div>
      </div>
    </main>
  );
}
