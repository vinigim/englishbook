import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/supabase/server";
import { BotaoSair } from "./botao-sair";

const LINKS = [
  { href: "/vagas", label: "Vagas" },
  { href: "/candidaturas", label: "Candidaturas" },
  { href: "/cv", label: "Meu CV" },
  { href: "/perfil", label: "Perfil e fontes" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, bloqueado } = await usuarioAtual();
  if (!user) redirect(bloqueado ? "/login?erro=sem_acesso" : "/login");

  // Primeiro acesso: cria o perfil com os termos padrão (e entra na busca diária).
  await supabase.from("perfil").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2">
          <span className="mr-4 font-semibold text-indigo-700">📡 Radar Mainframe</span>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              {l.label}
            </Link>
          ))}
          <span className="ml-auto" />
          <BotaoSair />
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
