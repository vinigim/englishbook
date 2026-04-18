import Link from "next/link";
import { Container } from "@/components/ui/Container";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="py-6">
        <Container>
          <Link
            href="/"
            className="font-display text-xl font-semibold text-ink tracking-tight"
          >
            EnglishBook
          </Link>
        </Container>
      </header>
      <main className="flex-1 flex items-center justify-center py-10">
        {children}
      </main>
    </div>
  );
}
