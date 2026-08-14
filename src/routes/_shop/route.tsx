import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_shop")({
  // Keep SSR off for the storefront UI
  ssr: false,
  // Do not force-sign-in here — allow public browsing.
  // We still return the current user (if any) for convenience.
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    return { user: data.user ?? null };
  },
  pendingMs: 0,
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Loading the bookstore…</p>
      </div>
    </div>
  ),
  component: () => <Outlet />,
});
