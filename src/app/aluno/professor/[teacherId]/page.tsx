import { notFound } from "next/navigation";
import {
  BookOpen,
  Play,
  FileText,
  Newspaper,
  Gamepad2,
  Mic,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { formatBRL } from "@/lib/utils";
import { RESOURCE_TYPE_LABELS } from "@/lib/types";
import type { ResourceType } from "@/lib/types";

export const dynamic = "force-dynamic";

const RESOURCE_ICONS: Record<ResourceType, React.ElementType> = {
  blog: BookOpen,
  youtube: Play,
  artigo: FileText,
  noticia: Newspaper,
  game: Gamepad2,
  podcast: Mic,
};

type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  topic_id: string | null;
  topic: { name: string } | null;
};

type ResourceRow = {
  id: string;
  type: ResourceType;
  title: string;
  url: string;
  description: string | null;
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

  // Busca vídeos e indicações em paralelo via admin client
  const admin = createAdminClient();
  const [videosResult, resourcesResult] = await Promise.all([
    admin
      .from("teacher_videos")
      .select("id, title, description, storage_path, topic_id, topic:topic_id(name)")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .returns<VideoRow[]>(),

    admin
      .from("teacher_resources")
      .select("id, type, title, url, description, topic_id, topic:topic_id(name)")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .returns<ResourceRow[]>(),
  ]);

  // Signed URLs para vídeos (1 h de validade)
  const videosWithUrls = await Promise.all(
    (videosResult.data ?? []).map(async (v) => {
      const { data } = await admin.storage
        .from("teacher-videos")
        .createSignedUrl(v.storage_path, 3600);
      return { ...v, signedUrl: data?.signedUrl ?? null };
    })
  );

  const resources = resourcesResult.data ?? [];

  // Coleta todos os topic_id presentes em vídeos ou indicações
  const topicKeys = new Map<string, string>(); // key → label
  for (const v of videosWithUrls) {
    const key = v.topic_id ?? "__geral__";
    if (!topicKeys.has(key)) topicKeys.set(key, v.topic?.name ?? "Geral");
  }
  for (const r of resources) {
    const key = r.topic_id ?? "__geral__";
    if (!topicKeys.has(key)) topicKeys.set(key, r.topic?.name ?? "Geral");
  }

  const hasContent = videosWithUrls.length > 0 || resources.length > 0;

  return (
    <Container size="md">
      <div className="py-10 md:py-16 space-y-12">
        <TeacherHeader teacher={teacher} teacherName={teacherName} isVip />

        {!hasContent ? (
          <Alert variant="info" title="Nenhum conteúdo ainda">
            {teacherName} ainda não adicionou vídeos ou indicações. Volte em
            breve!
          </Alert>
        ) : null}

        {/* Seção de vídeos */}
        {videosWithUrls.length > 0 ? (
          <div className="space-y-2">
            <h2 className="font-display text-3xl tracking-tight">Vídeos</h2>
            <ContentByTopic
              topicKeys={topicKeys}
              renderItems={(key) => {
                const items = videosWithUrls.filter(
                  (v) => (v.topic_id ?? "__geral__") === key
                );
                if (items.length === 0) return null;
                return (
                  <div className="space-y-8">
                    {items.map((video) => (
                      <div key={video.id} className="space-y-3">
                        <h4 className="font-medium">{video.title}</h4>
                        {video.description ? (
                          <p className="text-sm text-muted">
                            {video.description}
                          </p>
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
                );
              }}
            />
          </div>
        ) : null}

        {/* Seção de indicações */}
        {resources.length > 0 ? (
          <div className="space-y-2">
            <h2 className="font-display text-3xl tracking-tight">Indicações</h2>
            <ContentByTopic
              topicKeys={topicKeys}
              renderItems={(key) => {
                const items = resources.filter(
                  (r) => (r.topic_id ?? "__geral__") === key
                );
                if (items.length === 0) return null;
                return (
                  <ul className="space-y-4">
                    {items.map((r) => {
                      const Icon = RESOURCE_ICONS[r.type];
                      return (
                        <li
                          key={r.id}
                          className="border border-line p-4 space-y-2"
                        >
                          <div className="flex items-start gap-3">
                            <Icon className="w-4 h-4 mt-0.5 text-muted shrink-0" />
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs border border-line px-2 py-0.5 text-muted">
                                  {RESOURCE_TYPE_LABELS[r.type]}
                                </span>
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium hover:text-accent transition-colors link-underline"
                                >
                                  {r.title}
                                </a>
                              </div>
                              {r.description ? (
                                <p className="text-sm text-muted">
                                  {r.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                );
              }}
            />
          </div>
        ) : null}
      </div>
    </Container>
  );
}

/**
 * Renderiza conteúdo agrupado por tópico.
 * Só mostra um grupo se renderItems retornar algo não-nulo.
 */
function ContentByTopic({
  topicKeys,
  renderItems,
}: {
  topicKeys: Map<string, string>;
  renderItems: (key: string) => React.ReactNode;
}) {
  const entries = Array.from(topicKeys.entries());
  const multiTopic = entries.filter(([k]) => k !== "__geral__").length > 0;

  return (
    <div className="space-y-8 mt-4">
      {entries.map(([key, label]) => {
        const content = renderItems(key);
        if (!content) return null;
        return (
          <section key={key}>
            {multiTopic && (
              <h3 className="text-xs tracking-[0.2em] uppercase text-muted mb-4 border-b border-line pb-2">
                {key === "__geral__" ? "Geral" : label}
              </h3>
            )}
            {content}
          </section>
        );
      })}
    </div>
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
