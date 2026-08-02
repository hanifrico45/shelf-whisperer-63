import { supabase } from "@/integrations/supabase/client";

/**
 * Records authentication events (login / logout) into the shared audit trail.
 * Never throws — audit failures must not block the auth flow.
 */
export async function logAuthEvent(action: "Login" | "Logout", label?: string | null) {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("audit_logs").insert({
      user_id: data.user.id,
      action,
      entity_type: "auth",
      entity_id: null,
      entity_label: label ?? data.user.email ?? null,
      metadata: {} as never,
    });
  } catch (error) {
    console.warn("[audit] failed to record auth event", error);
  }
}

/** Waits until the persisted Supabase session is readable, so redirects never race. */
export async function waitForSession(timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
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
