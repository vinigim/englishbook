import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { Container } from "@/components/ui/Container";
import type { Profile } from "@/lib/types";

type NavItem = { href: string; label: string };

const studentNav: NavItem[] = [
  { href: "/aluno/dashboard", label: "Início" },
  { href: "/aluno/agendar", label: "Agendar" },
  { href: "/aluno/historico", label: "Histórico" },
  { href: "/aluno/preferencias", label: "Preferências" },
];

const teacherNav: NavItem[] = [
  { href: "/professor/dashboard", label: "Início" },
  { href: "/professor/disponibilidade", label: "Disponibilidade" },
  { href: "/professor/agenda", label: "Agenda" },
  { href: "/professor/perfil", label: "Perfil" },
];

export function AppNav({ profile }: { profile: Profile }) {
  const items = profile.role === "professor" ? teacherNav : studentNav;

  return (
    <nav className="border-b border-line bg-paper sticky top-0 z-10">
      <Container>
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link
              href={
                profile.role === "professor"
                  ? "/professor/dashboard"
                  : "/aluno/dashboard"
              }
              className="font-display text-xl font-semibold text-ink tracking-tight"
            >
              EnglishBook
            </Link>
            <ul className="hidden md:flex items-center gap-6 text-sm">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-ink hover:text-accent transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden sm:block text-muted">
              {profile.full_name.split(" ")[0]}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-muted hover:text-accent transition-colors"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </Container>
    </nav>
  );
}
