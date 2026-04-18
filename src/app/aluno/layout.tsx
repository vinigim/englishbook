import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";

export default async function AlunoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser("aluno");

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav profile={profile} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
