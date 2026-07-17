import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { DermaLuxNav } from "./Nav";
import { RealtimeRefresher } from "./RealtimeRefresher";

export const dynamic = "force-dynamic";

export default async function DermaLuxAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/derma-lux/login");

  return (
    <div className="min-h-screen">
      <DermaLuxNav email={user.email ?? ""} />
      <RealtimeRefresher />
      <main className="py-8 md:py-10">
        <Container size="xl">{children}</Container>
      </main>
    </div>
  );
}
