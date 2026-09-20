import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "customer";

const SAFE_NEXT = new Set(["/checkout", "/cart", "/shop", "/orders", "/account", "/dashboard"]);

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

/** Allow only known in-app paths back from /auth. */
export function sanitizeNext(next?: string | null): string | null {
  if (!next || typeof next !== "string") return null;
  const path = next.split("?")[0];
  return SAFE_NEXT.has(path) ? path : null;
}

/**
 * Landing route after sign-in.
 * Owners always go to the existing admin dashboard.
 * Customers return to checkout (or another safe next) when they came from there.
 */
export async function resolveHomeRoute(next?: string | null): Promise<string> {
  const roles = await fetchMyRoles();
  if (isStaffRole(roles)) return "/dashboard";
  return sanitizeNext(next) ?? "/shop";
}
