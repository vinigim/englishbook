import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { BookSlotButton } from "./BookSlotButton";
import { groupSlotsByDay } from "@/lib/slots";
import { formatBRL } from "@/lib/utils";
import type { AvailabilitySlot, LessonTopic } from "@/lib/types";

// Evita cache — disponibilidade muda em tempo real
export const dynamic = "force-dynamic";

type TeacherRow = {
  id: string;
  bio: string | null;
  hourly_price_cents: number;
  profiles: {
    full_name: string;
    avatar_url: string | null;
  };
};

export default async function AgendarPage() {
  const { supabase } = await requireUser("aluno");

  // Janela: agora + 30 dias
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // 1) Professores ativos com os dados do profile embutidos
  const { data: teachers, error: teachersError } = await supabase
    .from("teachers")
    .select(
      `
      id,
      bio,
      hourly_price_cents,
      profiles!inner (
        full_name,
        avatar_url
      )
    `
    )
    .eq("active", true)
    .returns<TeacherRow[]>();

  if (teachersError) {
    return (
      <Container>
        <div className="py-10">
          <Alert variant="danger" title="Erro ao carregar professores">
            {teachersError.message}
          </Alert>
        </div>
      </Container>
    );
  }

  const teacherIds = (teachers ?? []).map((t) => t.id);

  // 2) Slots disponíveis futuros + tópicos por professor (em paralelo)
  const [slotsResult, allTopicsResult, teacherTopicLinksResult] =
    await Promise.all([
      teacherIds.length > 0
        ? supabase
            .from("availability_slots")
            .select(
              "id, teacher_id, start_at, end_at, status, held_by_student_id, held_until"
            )
            .in("teacher_id", teacherIds)
            .eq("status", "available")
            .gte("start_at", now.toISOString())
            .lte("start_at", in30Days.toISOString())
            .order("start_at", { ascending: true })
        : Promise.resolve({ data: [] as AvailabilitySlot[] }),

      supabase
        .from("lesson_topics")
        .select("id, name, slug")
        .order("display_order")
        .returns<LessonTopic[]>(),

      teacherIds.length > 0
        ? supabase
            .from("teacher_topics")
            .select("teacher_id, topic_id")
            .in("teacher_id", teacherIds)
            .returns<{ teacher_id: string; topic_id: string }[]>()
        : Promise.resolve({ data: [] as { teacher_id: string; topic_id: string }[] }),
    ]);

  const slots = (slotsResult.data ?? []) as AvailabilitySlot[];
  const allTopics = allTopicsResult.data ?? [];
  const teacherTopicLinks = teacherTopicLinksResult.data ?? [];

  // Mapa topic_id → LessonTopic (preserva a ordem de display_order)
  const topicById = new Map(allTopics.map((t) => [t.id, t]));

  // Mapa teacher_id → LessonTopic[]
  const topicsByTeacher = new Map<string, LessonTopic[]>();
  for (const link of teacherTopicLinks) {
    const topic = topicById.get(link.topic_id);
    if (!topic) continue;
    const arr = topicsByTeacher.get(link.teacher_id) ?? [];
    arr.push(topic);
    topicsByTeacher.set(link.teacher_id, arr);
  }

  // 3) Agrupa slots por teacher
  const slotsByTeacher = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const arr = slotsByTeacher.get(slot.teacher_id) ?? [];
    arr.push(slot);
    slotsByTeacher.set(slot.teacher_id, arr);
  }

  // Ordena: professores com mais slots primeiro (ranking simples)
  const sortedTeachers = [...(teachers ?? [])].sort((a, b) => {
    const aCount = slotsByTeacher.get(a.id)?.length ?? 0;
    const bCount = slotsByTeacher.get(b.id)?.length ?? 0;
    return bCount - aCount;
  });

  return (
    <Container>
      <div className="py-10 md:py-16">
        <header className="mb-12 max-w-2xl">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Agendar aula
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Escolha um horário
          </h1>
          <p className="text-muted mt-3 leading-relaxed">
            Mostramos disponibilidade dos próximos 30 dias. Ao clicar, o horário
            fica reservado por 15 minutos enquanto você finaliza o pagamento.
          </p>
        </header>

        {sortedTeachers.length === 0 ? (
          <Alert variant="info" title="Nenhum professor disponível">
            Volte em breve — novos professores entram toda semana.
          </Alert>
        ) : null}

        <div className="space-y-16">
          {sortedTeachers.map((teacher) => {
            const teacherSlots = slotsByTeacher.get(teacher.id) ?? [];
            const grouped = groupSlotsByDay(teacherSlots);
            const teacherName = teacher.profiles.full_name;
            const teacherTopics = topicsByTeacher.get(teacher.id) ?? [];

            return (
              <section
                key={teacher.id}
                className="border-t border-line pt-10"
              >
                <div className="grid md:grid-cols-12 gap-8">
                  {/* Coluna do professor */}
                  <div className="md:col-span-4">
                    <h2 className="font-display text-3xl tracking-tight">
                      {teacherName}
                    </h2>
                    <p className="text-accent font-display text-xl mt-1">
                      {formatBRL(teacher.hourly_price_cents)}{" "}
                      <span className="text-muted text-sm font-body">
                        / aula
                      </span>
                    </p>
                    {teacher.bio ? (
                      <p className="text-muted mt-4 leading-relaxed text-sm">
                        {teacher.bio}
                      </p>
                    ) : null}
                    {teacherTopics.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {teacherTopics.map((topic) => (
                          <span
                            key={topic.id}
                            className="text-xs border border-line px-2 py-0.5 text-muted"
                          >
                            {topic.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <Link
                      href={`/aluno/professor/${teacher.id}`}
                      className="mt-5 inline-block text-xs text-muted hover:text-ink transition-colors link-underline"
                    >
                      Conteúdo VIP →
                    </Link>
                  </div>

                  {/* Coluna dos slots */}
                  <div className="md:col-span-8">
                    {grouped.length === 0 ? (
                      <p className="text-muted text-sm italic">
                        Sem horários disponíveis nos próximos 30 dias.
                      </p>
                    ) : (
                      <div className="space-y-8">
                        {grouped.map((day) => (
                          <div key={day.dayKey}>
                            <h3 className="text-xs tracking-[0.2em] uppercase text-muted mb-3">
                              {day.dayLabel}
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                              {day.slots.map((slot) => (
                                <BookSlotButton
                                  key={slot.id}
                                  slotId={slot.id}
                                  startAt={slot.start_at}
                                  endAt={slot.end_at}
                                  teacherName={teacherName}
                                  teacherTopics={teacherTopics}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </Container>
  );
}
