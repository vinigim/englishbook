import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";

export default async function ProfessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireUser("professor");

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav profile={profile} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
