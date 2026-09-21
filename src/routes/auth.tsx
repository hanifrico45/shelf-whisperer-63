import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError, logAuthEvent, waitForSession } from "@/lib/auth";
import { resolveHomeRoute, sanitizeNext } from "@/lib/roles";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "At least 6 characters").max(72),
});

const registerSchema = loginSchema.extend({
  fullName: z.string().trim().min(2, "Enter your name").max(100),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search["mode"] === "register" ? "register" : "login",
    next: typeof search["next"] === "string" ? search["next"] : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token && data.session.user) {
      throw redirect({ to: await resolveHomeRoute(search.next) });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in — Bookshelf" },
      { name: "description", content: "Sign in or create your Bookshelf account." },
      { property: "og:title", content: "Sign in — Bookshelf" },
      { property: "og:description", content: "Access your Bookshelf account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode, next } = Route.useSearch();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const safeNext = sanitizeNext(next);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", fullName: "", phone: "" },
  });

  useEffect(() => {
    let active = true;
    const go = async () => {
      const to = await resolveHomeRoute(safeNext);
      if (active) navigate({ to, replace: true });
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session?.user && !pending) void go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (pending) return;
      if (session?.user && event === "SIGNED_IN") void go();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, safeNext, pending]);

  async function onLogin(values: z.infer<typeof loginSchema>) {
    setPending(true);
    setFormError(null);
    const email = values.email.trim().toLowerCase();
    const password = values.password;
    try {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const message = friendlyAuthError(error);
        setFormError(message);
        toast.error(message);
        return;
      }
      const session = await waitForSession(4000, data.session);
      if (!session) {
        const message = "Signed in, but the session could not be restored. Please try again.";
        setFormError(message);
        toast.error(message);
        return;
      }
      void logAuthEvent("Login");
      toast.success("Welcome back");
      navigate({ to: await resolveHomeRoute(safeNext), replace: true });
    } catch (error) {
      const message = friendlyAuthError(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  async function onRegister(values: z.infer<typeof registerSchema>) {
    setPending(true);
    setFormError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { full_name: values.fullName, phone: values.phone },
        },
      });
      if (error) {
        const message = friendlyAuthError(error);
        setFormError(message);
        toast.error(message);
        return;
      }
      if (!data.session) {
        setEmailSent(true);
        toast.success("Check your email to confirm your account");
        return;
      }
      await waitForSession(4000, data.session);
      if (data.user) {
        await supabase.from("profiles").update({ phone: values.phone }).eq("id", data.user.id);
      }
      void logAuthEvent("Login", values.email);
      navigate({ to: await resolveHomeRoute(safeNext), replace: true });
    } catch (error) {
      const message = friendlyAuthError(error);
      setFormError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-gradient-brand p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="size-6" />
          <span className="font-display text-xl font-semibold">Bookshelf</span>
        </div>
        <div>
          <h2 className="max-w-md font-display text-4xl font-semibold leading-tight">
            Your neighbourhood bookstore, online.
          </h2>
          <p className="mt-4 max-w-sm text-sm opacity-80">
            Browse real titles, add them to your cart, and check out when you are ready.
          </p>
        </div>
        <p className="text-xs opacity-70">Bookshelf Store</p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
                <BookOpen className="size-5" />
              </span>
              <span className="font-display text-lg font-semibold">Bookshelf</span>
            </div>
          </div>
          {emailSent ? (
            <div className="card-elevated p-6 text-center">
              <h2 className="font-display text-xl font-semibold">Confirm your email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to your inbox. Click it to activate your account, then sign in.
              </p>
              <Button className="mt-5 w-full" onClick={() => setEmailSent(false)}>Back to sign in</Button>
            </div>
          ) : (
            <Tabs defaultValue={mode}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="register">Create account</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-6">
                <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {safeNext === "/checkout"
                    ? "Sign in to complete your order. Your cart will be waiting."
                    : "You can sign in with an empty cart. Staff are taken to the admin dashboard."}
                </p>
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="mt-6 space-y-4">
                    <FormField control={loginForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" placeholder="you@email.com" autoComplete="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={loginForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
                    <div className="text-right">
                      <Link to="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Forgot password?</Link>
                    </div>
                    <Button type="submit" className="w-full" disabled={pending}>
                      {pending ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
              <TabsContent value="register" className="mt-6">
                <h1 className="font-display text-2xl font-semibold">Create your account</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  New accounts are customer accounts. You do not need items in your cart to create one.
                </p>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegister)} className="mt-6 space-y-4">
                    <FormField control={registerForm.control} name="fullName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl><Input placeholder="Ada Okoro" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone number</FormLabel>
                        <FormControl><Input type="tel" placeholder="e.g. 0803 000 1234" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="email" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" placeholder="you@email.com" autoComplete="email" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="password" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl><Input type="password" placeholder="At least 6 characters" autoComplete="new-password" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
                    <Button type="submit" className="w-full" disabled={pending}>
                      {pending ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
