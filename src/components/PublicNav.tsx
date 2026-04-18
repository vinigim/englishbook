import Link from "next/link";
import { Container } from "@/components/ui/Container";

export function PublicNav() {
  return (
    <nav className="border-b border-line bg-paper">
      <Container>
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="font-display text-2xl font-semibold text-ink tracking-tight">
            EnglishBook
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/login" className="text-ink link-underline">
              Entrar
            </Link>
            <Link
              href="/signup"
              className="bg-ink text-paper px-4 h-9 inline-flex items-center hover:bg-accent transition-colors"
            >
              Criar conta
            </Link>
          </div>
        </div>
      </Container>
    </nav>
  );
}
