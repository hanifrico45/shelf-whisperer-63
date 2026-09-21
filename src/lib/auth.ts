import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

/** Local session first. Avoid getUser() unless nothing is stored — it can wipe a valid session. */
export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export async function persistSession(session: Session | null | undefined) {
  if (!session?.access_token || !session.refresh_token) return session ?? null;
  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) {
    console.warn("[auth] setSession failed", error.message);
    return session;
  }
  return data.session ?? session;
}

/**
 * Records authentication events (login / logout) into the shared audit trail.
 * Never throws — audit failures must not block the auth flow.
 */
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

/** Waits until the persisted Supabase session is readable, so redirects never race. */
export async function waitForSession(timeoutMs = 4000, existing?: Session | null) {
  if (existing) {
    await persistSession(existing);
    return existing;
  }
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const session = await getCurrentSession();
    if (session) return session;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

/** Maps Supabase / network errors to friendly copy for toasts. */
export function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You appear to be offline. Check your connection and try again.";
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(message))
    return "Confirm your email address before signing in.";
  if (/already registered|already exists/i.test(message))
    return "An account with this email already exists. Try signing in.";
  if (/rate limit|too many/i.test(message))
    return "Too many attempts. Please wait a moment and try again.";
  return message || "Something went wrong. Please try again.";
}
