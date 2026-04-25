import { requireUser } from "@/lib/auth";
import { Container } from "@/components/ui/Container";
import { Alert } from "@/components/ui/Badge";
import { ResourceAddForm } from "./ResourceAddForm";
import { deleteResourceAction } from "./actions";
import { RESOURCE_TYPE_LABELS } from "@/lib/types";
import type { LessonTopic, ResourceType } from "@/lib/types";

export const dynamic = "force-dynamic";

type ResourceRow = {
  id: string;
  type: ResourceType;
  title: string;
  url: string;
  description: string | null;
  topic_id: string | null;
  topic: { name: string } | null;
};

export default async function RecursosPage() {
  const { user, supabase } = await requireUser("professor");

  const [resourcesResult, topicsResult] = await Promise.all([
    supabase
      .from("teacher_resources")
      .select("id, type, title, url, description, topic_id, topic:topic_id(name)")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false })
      .returns<ResourceRow[]>(),

    supabase
      .from("teacher_topics")
      .select("topic:topic_id(id, name, slug)")
      .eq("teacher_id", user.id)
      .returns<{ topic: LessonTopic }[]>(),
  ]);

  const resources = resourcesResult.data ?? [];
  const topics = (topicsResult.data ?? []).map((r) => r.topic);

  // Agrupa por tópico preservando a ordem de inserção dentro de cada grupo
  const grouped = new Map<string, { label: string; items: ResourceRow[] }>();
  grouped.set("__geral__", { label: "Sem tópico específico", items: [] });
  for (const r of resources) {
    const key = r.topic_id ?? "__geral__";
    const label = r.topic?.name ?? "Sem tópico específico";
    if (!grouped.has(key)) grouped.set(key, { label, items: [] });
    grouped.get(key)!.items.push(r);
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
              Indicações
            </h1>
            <p className="text-muted mt-3 text-sm">
              Blogs, vídeos, artigos, games e podcasts exclusivos para seus
              alunos VIP.
            </p>
          </div>
          <ResourceAddForm topics={topics} />
        </header>

        {resourcesResult.error ? (
          <Alert variant="danger" title="Erro">
            {resourcesResult.error.message}
          </Alert>
        ) : null}

        {resources.length === 0 && !resourcesResult.error ? (
          <Alert variant="info" title="Nenhuma indicação ainda">
            Adicione links de conteúdo externo para enriquecer a experiência dos
            seus alunos VIP.
          </Alert>
        ) : null}

        <div className="space-y-12">
          {Array.from(grouped.entries()).map(([key, group]) => {
            if (group.items.length === 0) return null;
            return (
              <section key={key}>
                <h2 className="font-display text-2xl tracking-tight border-b border-ink pb-2 mb-4">
                  {group.label}
                </h2>
                <ul className="divide-y divide-line">
                  {group.items.map((r) => (
                    <ResourceListItem key={r.id} resource={r} />
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

function ResourceListItem({ resource }: { resource: ResourceRow }) {
  return (
    <li className="py-4 grid grid-cols-1 sm:grid-cols-12 gap-3 sm:items-start">
      <div className="sm:col-span-10 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs border border-line px-2 py-0.5 text-muted">
            {RESOURCE_TYPE_LABELS[resource.type]}
          </span>
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:text-accent transition-colors link-underline"
          >
            {resource.title}
          </a>
        </div>
        {resource.description ? (
          <p className="text-sm text-muted">{resource.description}</p>
        ) : null}
        <p className="text-xs text-muted truncate">{resource.url}</p>
      </div>
      <div className="sm:col-span-2 flex justify-start sm:justify-end">
        <form
          action={async () => {
            "use server";
            await deleteResourceAction(resource.id);
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
