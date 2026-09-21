import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export const currentUserQuery = {
  queryKey: ["current-user"] as const,
  queryFn: getCurrentUser,
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
};

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function logAuthEvent(action: "Login" | "Logout", label?: string | null) {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action,
      entity_type: "auth",
      entity_id: null,
      entity_label: label ?? user.email ?? null,
      metadata: {} as never,
    });
  } catch (error) {
    console.warn("[audit] failed to record auth event", error);
  }
}

export async function waitForSession(timeoutMs = 4000, existing?: Session | null) {
  if (existing?.user) return existing;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const session = await getCurrentSession();
    if (session?.user) return session;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

export function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(message))
    return "Confirm your email address before signing in.";
  if (/already registered|already exists/i.test(message))
    return "An account with this email already exists. Try signing in.";
  if (/rate limit|too many/i.test(message))
    return "Too many attempts. Please wait a moment and try again.";
  return message || "Something went wrong. Please try again.";
}
