import { getCurrentUser } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "customer";

const SAFE_NEXT = new Set(["/checkout", "/cart", "/shop", "/orders", "/account", "/dashboard"]);

export async function fetchMyRoles(): Promise<AppRole[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (error) {
    console.warn("[roles] failed to load user_roles", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.role as AppRole);
}

export function isStaffRole(roles: AppRole[]) {
  return roles.includes("owner");
}

export function sanitizeNext(next?: string | null): string | null {
  if (!next || typeof next !== "string") return null;
  const path = next.split("?")[0];
  return SAFE_NEXT.has(path) ? path : null;
}

export async function resolveHomeRoute(next?: string | null): Promise<string> {
  const roles = await fetchMyRoles();
  if (isStaffRole(roles)) return "/dashboard";
  return sanitizeNext(next) ?? "/shop";
}
