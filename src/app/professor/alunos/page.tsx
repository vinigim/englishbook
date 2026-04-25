import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { VipToggle } from "./VipToggle";

export const dynamic = "force-dynamic";

type StudentRow = {
  id: string;
  full_name: string;
  email: string;
  bookingCount: number;
  isVip: boolean;
};

export default async function AlunosPage() {
  const { user, supabase } = await requireUser("professor");

  const [bookingsResult, vipResult] = await Promise.all([
    supabase
      .from("bookings")
      .select("student_id, profiles:student_id(full_name, email)")
      .eq("teacher_id", user.id)
      .in("status", ["confirmed", "completed"])
      .limit(500)
      .returns<
        {
          student_id: string;
          profiles: { full_name: string; email: string } | null;
        }[]
      >(),

    supabase
      .from("teacher_student_vip")
      .select("student_id")
      .eq("teacher_id", user.id)
      .returns<{ student_id: string }[]>(),
  ]);

  if (bookingsResult.error) {
    return (
      <Container>
        <div className="py-10">
          <Alert variant="danger" title="Erro">
            {bookingsResult.error.message}
          </Alert>
        </div>
      </Container>
    );
  }

  const vipSet = new Set(
    (vipResult.data ?? []).map((r) => r.student_id)
  );

  // Deduplica por aluno e conta aulas
  const studentMap = new Map<string, StudentRow>();
  for (const b of bookingsResult.data ?? []) {
    const existing = studentMap.get(b.student_id);
    if (existing) {
      existing.bookingCount++;
    } else {
      studentMap.set(b.student_id, {
        id: b.student_id,
        full_name: b.profiles?.full_name ?? "Aluno",
        email: b.profiles?.email ?? "",
        bookingCount: 1,
        isVip: vipSet.has(b.student_id),
      });
    }
  }

  const students = Array.from(studentMap.values()).sort((a, b) =>
    a.full_name.localeCompare(b.full_name, "pt-BR")
  );

  return (
    <Container>
      <div className="py-10 md:py-16">
        <header className="mb-10">
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
            Gerenciar
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Seus alunos
          </h1>
          <p className="text-muted mt-3 text-sm">
            Alunos VIP têm acesso aos seus vídeos exclusivos.
          </p>
        </header>

        {students.length === 0 ? (
          <Alert variant="info" title="Nenhum aluno ainda">
            Seus alunos aparecerão aqui após a primeira aula confirmada.
          </Alert>
        ) : (
          <ul className="divide-y divide-line">
            {students.map((student) => (
              <li
                key={student.id}
                className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-3 sm:items-center"
              >
                <div className="sm:col-span-6">
                  <p className="font-medium">{student.full_name}</p>
                  <p className="text-xs text-muted">{student.email}</p>
                </div>
                <div className="sm:col-span-3 text-sm text-muted">
                  {student.bookingCount}{" "}
                  {student.bookingCount === 1 ? "aula" : "aulas"}
                </div>
                <div className="sm:col-span-3 flex justify-start sm:justify-end">
                  <VipToggle
                    teacherId={user.id}
                    studentId={student.id}
                    initialIsVip={student.isVip}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
