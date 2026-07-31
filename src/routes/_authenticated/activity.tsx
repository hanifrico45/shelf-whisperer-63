import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { fetchAuditLogs } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity log — Bookshelf Inventory" },
      { name: "description", content: "Full audit trail of every inventory action by staff." },
      { property: "og:title", content: "Activity log — Bookshelf Inventory" },
      { property: "og:description", content: "Audit trail of inventory actions." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const logs = useQuery({ queryKey: ["audit", "all"], queryFn: () => fetchAuditLogs(100) });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .returns<{ id: string; full_name: string | null; email: string | null }[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameFor = (userId: string | null) => {
    const profile = profiles.data?.find((p) => p.id === userId);
    return profile?.full_name ?? profile?.email ?? "Unknown user";
  };

  return (
    <AppShell title="Activity" description="Audit trail of every inventory action">
      <div className="card-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : (logs.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
                      <History className="size-5 text-secondary-foreground" />
                    </span>
                    <p className="font-display text-lg font-semibold">No activity yet</p>
                    <p className="text-sm text-muted-foreground">
                      Adding, editing, archiving or deleting a book will be recorded here.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.data!.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge variant="secondary">{log.action}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{log.entity_label ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {nameFor(log.user_id)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
