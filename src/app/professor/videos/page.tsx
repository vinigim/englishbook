import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { VideoUploadForm } from "./VideoUploadForm";
import { deleteVideoAction } from "./actions";
import { formatDateTime } from "@/lib/utils";
import type { LessonTopic } from "@/lib/types";

export const dynamic = "force-dynamic";

type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  topic_id: string | null;
  topic: { name: string } | null;
  created_at: string;
};

export default async function VideosPage() {
  const { user, supabase } = await requireUser("professor");

  const [videosResult, topicsResult] = await Promise.all([
    supabase
      .from("teacher_videos")
      .select("id, title, description, storage_path, topic_id, topic:topic_id(name), created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false })
      .returns<VideoRow[]>(),

    supabase
      .from("teacher_topics")
      .select("topic:topic_id(id, name, slug)")
      .eq("teacher_id", user.id)
      .returns<{ topic: LessonTopic }[]>(),
  ]);

  const videos = videosResult.data ?? [];
  const topics = (topicsResult.data ?? []).map((r) => r.topic);

  // Agrupa vídeos por tópico
  const grouped = new Map<string, { label: string; items: VideoRow[] }>();
  grouped.set("__geral__", { label: "Sem tópico específico", items: [] });
  for (const v of videos) {
    const key = v.topic_id ?? "__geral__";
    const label = v.topic?.name ?? "Sem tópico específico";
    if (!grouped.has(key)) grouped.set(key, { label, items: [] });
    grouped.get(key)!.items.push(v);
  }

  return (
    <Container>
      <div className="py-10 md:py-16">
        <header className="mb-10 flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-sm text-muted tracking-[0.2em] uppercase mb-3">
              Conteúdo VIP
            </p>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">
              Seus vídeos
            </h1>
            <p className="text-muted mt-3 text-sm">
              Somente alunos que você marcar como VIP poderão assistir.
            </p>
          </div>
          <VideoUploadForm teacherId={user.id} topics={topics} />
        </header>

        {videosResult.error ? (
          <Alert variant="danger" title="Erro">
            {videosResult.error.message}
          </Alert>
        ) : null}

        {videos.length === 0 && !videosResult.error ? (
          <Alert variant="info" title="Nenhum vídeo ainda">
            Adicione vídeos exclusivos para seus alunos VIP.
          </Alert>
        ) : null}

        <div className="space-y-12">
          {Array.from(grouped.entries()).map(([key, group]) => {
            if (group.items.length === 0) return null;
            return (
              <section key={key}>
                <h2 className="font-display text-2xl tracking-tight border-b border-ink pb-2 mb-6">
                  {group.label}
                </h2>
                <ul className="space-y-4">
                  {group.items.map((video) => (
                    <VideoListItem key={video.id} video={video} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </Container>
  );
}

function VideoListItem({ video }: { video: VideoRow }) {
  return (
    <li className="border border-line p-5 grid grid-cols-1 sm:grid-cols-12 gap-4 sm:items-center">
      <div className="sm:col-span-8">
        <p className="font-medium">{video.title}</p>
        {video.description ? (
          <p className="text-sm text-muted mt-1 line-clamp-2">
            {video.description}
          </p>
        ) : null}
        <p className="text-xs text-muted mt-2">
          {formatDateTime(video.created_at)}
        </p>
      </div>
      <div className="sm:col-span-4 flex justify-start sm:justify-end">
        <form
          action={async () => {
            "use server";
            await deleteVideoAction(video.id);
          }}
        >
          <button
            type="submit"
            className="text-xs text-muted hover:text-accent transition-colors"
          >
            Remover
          </button>
        </form>
      </div>
    </li>
  );
}
