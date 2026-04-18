import Link from "next/link";
import { PublicNav } from "@/components/PublicNav";
import { Footer } from "@/components/Footer";
import { Container } from "@/components/ui/Container";
import { ArrowRight, Calendar, CreditCard, MessageSquare } from "lucide-react";

export default function HomePage() {
  return (
    <>
      <PublicNav />

      {/* HERO */}
      <section className="border-b border-line">
        <Container size="xl">
          <div className="grid md:grid-cols-12 gap-10 py-20 md:py-32">
            <div className="md:col-span-7">
              <p className="text-sm text-muted tracking-[0.2em] uppercase mb-6">
                Aulas particulares · Online · Sob medida
              </p>
              <h1 className="font-display text-5xl md:text-7xl leading-[0.95] tracking-tight text-ink">
                Inglês que se encaixa na sua{" "}
                <span className="italic text-accent">agenda</span>, não o contrário.
              </h1>
              <p className="mt-8 text-lg text-muted max-w-xl leading-relaxed">
                Escolha o professor, o horário e pague online. Simples assim.
                Nada de pacotes fechados, plataforma travada ou mensalidade que
                você esquece de cancelar.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <Link
                  href="/signup"
                  className="group inline-flex items-center justify-center gap-2 bg-ink text-paper h-14 px-8 text-lg font-medium hover:bg-accent transition-colors"
                >
                  Começar agora
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link
                  href="/signup?role=professor"
                  className="inline-flex items-center justify-center h-14 px-8 text-lg border border-ink hover:bg-ink hover:text-paper transition-colors"
                >
                  Sou professor
                </Link>
              </div>
            </div>

            {/* Coluna lateral com "ticket" decorativo */}
            <div className="md:col-span-5 md:pl-10 flex items-start justify-center md:justify-end">
              <div className="relative w-full max-w-sm">
                <div className="bg-ink text-paper p-8 relative">
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <p className="text-xs tracking-[0.2em] uppercase opacity-70">
                        EnglishBook
                      </p>
                      <p className="font-display text-2xl mt-1">Lesson Pass</p>
                    </div>
                    <span className="text-xs tracking-widest opacity-70">
                      № 001
                    </span>
                  </div>
                  <div className="border-t border-paper/20 pt-6 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="opacity-70">Professor</span>
                      <span>Maria S.</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="opacity-70">Quando</span>
                      <span>Ter 15:00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="opacity-70">Duração</span>
                      <span>60 min</span>
                    </div>
                    <div className="flex justify-between text-sm pt-3 border-t border-paper/20">
                      <span className="opacity-70">Total</span>
                      <span className="font-display text-xl">R$ 80</span>
                    </div>
                  </div>
                </div>
                <div className="absolute -right-3 -bottom-3 w-full h-full border-2 border-accent -z-10" />
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* COMO FUNCIONA */}
      <section className="py-20 md:py-28">
        <Container>
          <div className="max-w-2xl mb-16">
            <p className="text-sm text-muted tracking-[0.2em] uppercase mb-4">
              Como funciona
            </p>
            <h2 className="font-display text-4xl md:text-5xl tracking-tight">
              Três passos. Nenhuma letra miúda.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-line">
            <Step
              number="01"
              icon={<MessageSquare className="w-5 h-5" />}
              title="Escolha um professor"
              description="Veja quem está disponível, leia a bio e encontre o match. Cada professor define o próprio preço."
            />
            <Step
              number="02"
              icon={<Calendar className="w-5 h-5" />}
              title="Pegue um horário"
              description="A agenda é em tempo real. Você vê o que está livre agora e reserva em segundos."
            />
            <Step
              number="03"
              icon={<CreditCard className="w-5 h-5" />}
              title="Pague e pronto"
              description="Pagamento seguro via Stripe. A aula é confirmada automaticamente no seu calendário."
            />
          </div>
        </Container>
      </section>

      {/* PARA PROFESSORES */}
      <section className="bg-ink text-paper py-20 md:py-28">
        <Container>
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm tracking-[0.2em] uppercase mb-4 opacity-60">
                Para professores
              </p>
              <h2 className="font-display text-4xl md:text-5xl tracking-tight leading-tight">
                Sua agenda, seu preço,{" "}
                <span className="italic text-accent">seu ritmo.</span>
              </h2>
              <p className="mt-6 text-lg opacity-80 leading-relaxed">
                Defina quando quer dar aula, cadastre seus horários e receba
                pagamentos direto. A gente cuida da cobrança, dos lembretes e
                do resto.
              </p>
              <Link
                href="/signup?role=professor"
                className="mt-8 inline-flex items-center gap-2 text-accent link-underline"
              >
                Cadastrar como professor
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <ul className="space-y-6">
              {[
                "Cadastro de horários em minutos",
                "Pagamento garantido no momento da reserva",
                "Dashboard com todas as aulas do mês",
                "Sem mensalidade, sem pegadinha",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-4 border-b border-paper/10 pb-6"
                >
                  <span className="text-accent font-display text-2xl leading-none">
                    ◆
                  </span>
                  <span className="text-lg">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* CTA FINAL */}
      <section className="py-20 md:py-28">
        <Container size="md">
          <div className="text-center">
            <h2 className="font-display text-4xl md:text-6xl tracking-tight leading-[1]">
              Próxima aula começa{" "}
              <span className="italic text-accent">quando você decidir.</span>
            </h2>
            <div className="mt-10">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 bg-ink text-paper h-14 px-10 text-lg font-medium hover:bg-accent transition-colors"
              >
                Criar conta grátis
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Footer />
    </>
  );
}

function Step({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-paper p-8 md:p-10">
      <div className="flex items-center gap-4 mb-6">
        <span className="font-display text-4xl text-accent">{number}</span>
        <span className="text-muted">{icon}</span>
      </div>
      <h3 className="font-display text-2xl tracking-tight mb-3">{title}</h3>
      <p className="text-muted leading-relaxed">{description}</p>
    </div>
  );
}
