import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { SlotCreateForms } from "./SlotCreateForms";
import { DeleteSlotButton } from "./DeleteSlotButton";
import { groupSlotsByDay } from "@/lib/slots";
import { formatTime } from "@/lib/utils";
import type { AvailabilitySlot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DisponibilidadePage() {
  const { user, supabase } = await requireUser("professor");

  // Slots futuros deste professor (available + pending + booked)
  const now = new Date().toISOString();
  const { data: slots } = await supabase
    .from("availability_slots")
    .select(
      "id, teacher_id, start_at, end_at, status, held_by_student_id, held_until"
    )
    .eq("teacher_id", user.id)
    .gte("start_at", now)
    .in("status", ["available", "pending", "booked"])
    .order("start_at", { ascending: true })
    .returns<AvailabilitySlot[]>();

  const byDay = groupSlotsByDay(slots ?? []);
  const totalAvailable = (slots ?? []).filter(
    (s) => s.status === "available"
  ).length;
  const totalBooked = (slots ?? []).filter((s) => s.status === "booked").length;

  return (
    <Container>
      <div className="py-10 md:py-16">
        <header className="mb-12">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Sua agenda
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Disponibilidade
          </h1>
          <p className="text-muted mt-3 max-w-xl leading-relaxed">
            Adicione horários que você pode dar aula. Os alunos vão ver apenas
            os que ainda estão livres.
          </p>
        </header>

        <div className="grid lg:grid-cols-5 gap-10">
          {/* FORMULÁRIOS */}
          <section className="lg:col-span-2">
            <h2 className="font-display text-2xl tracking-tight mb-4">
              Adicionar horários
            </h2>
            <SlotCreateForms />
          </section>

          {/* LISTA DE SLOTS */}
          <section className="lg:col-span-3">
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="font-display text-2xl tracking-tight">
                Horários cadastrados
              </h2>
              <div className="flex gap-2 text-xs">
                <Badge variant="neutral">{totalAvailable} livre{totalAvailable === 1 ? "" : "s"}</Badge>
                <Badge variant="success">{totalBooked} reservada{totalBooked === 1 ? "" : "s"}</Badge>
              </div>
            </div>

            {byDay.length === 0 ? (
              <div className="border border-dashed border-line p-10 text-center">
                <p className="text-muted italic">
                  Nenhum horário cadastrado ainda. Comece pelo formulário ao lado.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {byDay.map((day) => (
                  <div key={day.dayKey}>
                    <h3 className="text-xs tracking-[0.2em] uppercase text-muted mb-3 capitalize">
                      {day.dayLabel}
                    </h3>
                    <ul className="divide-y divide-line border-t border-line">
                      {day.slots.map((slot) => (
                        <li
                          key={slot.id}
                          className="py-3 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-display text-lg tracking-tight w-24">
                              {formatTime(slot.start_at)}
                            </span>
                            <span className="text-sm text-muted">
                              até {formatTime(slot.end_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {slot.status === "available" ? (
                              <>
                                <Badge variant="neutral">Livre</Badge>
                                <DeleteSlotButton slotId={slot.id} />
                              </>
                            ) : slot.status === "pending" ? (
                              <Badge variant="warning">Sendo reservada…</Badge>
                            ) : (
                              <Badge variant="success">Reservada</Badge>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </Container>
  );
}
