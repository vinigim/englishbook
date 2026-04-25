import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { formatBRL } from "@/lib/utils";

export const dynamic = "force-dynamic";

type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  topic_id: string | null;
  topic: { name: string } | null;
};

type TeacherRow = {
  bio: string | null;
  hourly_price_cents: number;
  profiles: { full_name: string } | null;
};

export default async function TeacherVipPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  const { user, supabase } = await requireUser("aluno");

  // Dados públicos do professor
  const { data: teacher } = await supabase
    .from("teachers")
    .select("bio, hourly_price_cents, profiles!inner(full_name)")
    .eq("id", teacherId)
    .eq("active", true)
    .single<TeacherRow>();

  if (!teacher) notFound();

  const teacherName = teacher.profiles?.full_name ?? "Professor";

  // Verifica se este aluno é VIP para este professor
  const { data: vipRow } = await supabase
    .from("teacher_student_vip")
    .select("student_id")
    .eq("teacher_id", teacherId)
    .eq("student_id", user.id)
    .maybeSingle();

  const isVip = !!vipRow;

  // Se não é VIP, mostra a página mas sem conteúdo restrito
  if (!isVip) {
    return (
      <Container size="md">
        <div className="py-10 md:py-16 space-y-10">
          <TeacherHeader teacher={teacher} teacherName={teacherName} />
          <Alert variant="info" title="Acesso VIP não liberado">
            Você ainda não tem acesso ao conteúdo VIP de {teacherName}. Conclua
            aulas com este professor — ele pode liberar seu acesso a qualquer
            momento.
          </Alert>
        </div>
      </Container>
    );
  }

  // Busca vídeos via admin (RLS de teacher_videos só permite o professor ler)
  const admin = createAdminClient();
  const { data: videos } = await admin
    .from("teacher_videos")
    .select("id, title, description, storage_path, topic_id, topic:topic_id(name)")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .returns<VideoRow[]>();

  // Gera signed URLs (1 hora de validade)
  const videosWithUrls = await Promise.all(
    (videos ?? []).map(async (v) => {
      const { data } = await admin.storage
        .from("teacher-videos")
        .createSignedUrl(v.storage_path, 3600);
      return { ...v, signedUrl: data?.signedUrl ?? null };
    })
  );

  // Agrupa por tópico
  const grouped = new Map<string, { label: string; items: typeof videosWithUrls }>();
  for (const v of videosWithUrls) {
    const key = v.topic_id ?? "__geral__";
    const label = v.topic?.name ?? "Geral";
    if (!grouped.has(key)) grouped.set(key, { label, items: [] });
    grouped.get(key)!.items.push(v);
  }

  return (
    <Container size="md">
      <div className="py-10 md:py-16 space-y-12">
        <TeacherHeader teacher={teacher} teacherName={teacherName} isVip />

        {videosWithUrls.length === 0 ? (
          <Alert variant="info" title="Nenhum vídeo disponível">
            {teacherName} ainda não adicionou vídeos. Volte em breve!
          </Alert>
        ) : (
          <div className="space-y-12">
            {Array.from(grouped.entries()).map(([key, group]) => (
              <section key={key}>
                <h2 className="font-display text-2xl tracking-tight border-b border-ink pb-2 mb-6">
                  {group.label}
                </h2>
                <div className="space-y-8">
                  {group.items.map((video) => (
                    <div key={video.id} className="space-y-3">
                      <h3 className="font-medium">{video.title}</h3>
                      {video.description ? (
                        <p className="text-sm text-muted">{video.description}</p>
                      ) : null}
                      {video.signedUrl ? (
                        <video
                          controls
                          preload="metadata"
                          className="w-full border border-line"
                          style={{ maxHeight: "480px" }}
                        >
                          <source src={video.signedUrl} />
                          Seu navegador não suporta reprodução de vídeo.
                        </video>
                      ) : (
                        <p className="text-sm text-accent">
                          Vídeo temporariamente indisponível.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}

function TeacherHeader({
  teacher,
  teacherName,
  isVip,
}: {
  teacher: TeacherRow;
  teacherName: string;
  isVip?: boolean;
}) {
  return (
    <header className="space-y-2">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted tracking-[0.2em] uppercase mb-2">
            Conteúdo VIP
          </p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            {teacherName}
          </h1>
        </div>
        {isVip ? (
          <span className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 border border-ink bg-ink text-paper text-xs font-medium">
            ★ VIP
          </span>
        ) : null}
      </div>
      <p className="text-accent font-display text-xl">
        {formatBRL(teacher.hourly_price_cents)}{" "}
        <span className="text-muted text-sm font-body">/ aula</span>
      </p>
      {teacher.bio ? (
        <p className="text-muted leading-relaxed text-sm pt-1">{teacher.bio}</p>
      ) : null}
    </header>
  );
}
