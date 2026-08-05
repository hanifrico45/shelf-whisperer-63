import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "customer";

/** Roles for the signed-in user. Returns [] when signed out. */
export async function fetchMyRoles(): Promise<AppRole[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id);
  if (error) return [];
  return (data ?? []).map((r) => r.role as AppRole);
}

/** Only owners get the admin workspace. */
export function isStaffRole(roles: AppRole[]) {
  return roles.includes("owner");
}

/** Landing route after sign-in: admin workspace for owners, storefront for customers. */
export async function resolveHomeRoute(): Promise<"/dashboard" | "/shop"> {
  const roles = await fetchMyRoles();
  return isStaffRole(roles) ? "/dashboard" : "/shop";
}
