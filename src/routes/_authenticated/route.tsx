import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyRoles, isStaffRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData.session?.user ?? null;
    const { data, error } = sessionUser ? { data: { user: sessionUser }, error: null } : await supabase.auth.getUser();
    const user = data.user ?? sessionUser;
    if (error || !user) throw redirect({ to: "/auth", search: { mode: "login" } });
    const roles = await fetchMyRoles();
    if (!isStaffRole(roles)) throw redirect({ to: "/shop" });
    return { user, roles };
  },

  pendingMs: 0,
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Checking your session…</p>
      </div>
    </div>
  ),
  component: () => <Outlet />,
});
