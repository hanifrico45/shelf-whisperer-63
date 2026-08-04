import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "manager" | "cashier" | "inventory_staff" | "customer";

const STAFF_ROLES: AppRole[] = ["owner", "manager", "cashier", "inventory_staff"];

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

export function isStaffRole(roles: AppRole[]) {
  return roles.some((r) => STAFF_ROLES.includes(r));
}

/** Landing route after sign-in: admin workspace for staff, storefront for customers. */
export async function resolveHomeRoute(): Promise<"/dashboard" | "/shop"> {
  const roles = await fetchMyRoles();
  return isStaffRole(roles) ? "/dashboard" : "/shop";
}
