import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";

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
import { ROLE_LABELS, type AppRole } from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & roles — Bookshelf Inventory" },
      { name: "description", content: "Staff accounts and their assigned bookstore roles." },
      { property: "og:title", content: "Team & roles — Bookshelf Inventory" },
      { property: "og:description", content: "Staff accounts and assigned roles." },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const team = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles, error: rolesError }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,email,phone,created_at")
          .order("created_at")
          .returns<{ id: string; full_name: string | null; email: string | null; phone: string | null; created_at: string }[]>(),
        supabase
          .from("user_roles")
          .select("user_id,role")
          .returns<{ user_id: string; role: AppRole }[]>(),
      ]);
      if (error) throw error;
      if (rolesError) throw rolesError;
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
      }));
    },
  });

  return (
    <AppShell title="Team" description="Staff accounts and role assignments">
      <div className="card-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : (team.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
                      <Users className="size-5 text-secondary-foreground" />
                    </span>
                    <p className="font-display text-lg font-semibold">No team members yet</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              team.data!.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.full_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {member.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {member.roles.length === 0 ? (
                        <span className="text-sm text-muted-foreground">No role</span>
                      ) : (
                        member.roles.map((role) => (
                          <Badge key={role} variant="secondary">
                            {ROLE_LABELS[role]}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {new Date(member.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Role-based permissions are enforced in a later phase. The first registered account is the
        store Owner.
      </p>
    </AppShell>
  );
}
