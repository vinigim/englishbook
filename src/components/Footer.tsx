import { Container } from "@/components/ui/Container";

export function Footer() {
  return (
    <footer className="border-t border-line mt-24 py-10 text-sm text-muted">
      <Container>
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <p className="font-display text-ink">
            EnglishBook <span className="text-muted font-body">— aulas de inglês sob medida</span>
          </p>
          <p>© {new Date().getFullYear()} EnglishBook. Todos os direitos reservados.</p>
        </div>
      </Container>
    </footer>
  );
}
