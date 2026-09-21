import { useState } from "react";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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
import { friendlyAuthError, getCurrentUser, logAuthEvent, waitForSession } from "@/lib/auth";
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
    const user = await getCurrentUser();
    if (user) throw redirect({ to: await resolveHomeRoute(search.next) });
  },
  head: () => ({
    meta: [
      { title: "Sign in — Bookshelf" },
      { name: "description", content: "Sign in or create your Bookshelf account." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode, next } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  async function finishSignIn(user: { id: string } | null | undefined) {
    if (user) queryClient.setQueryData(["current-user"], user);
    await queryClient.invalidateQueries({ queryKey: ["cart"] });
    await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    await queryClient.invalidateQueries({ queryKey: ["my-roles"] });
    toast.success("Welcome back");
    navigate({ to: await resolveHomeRoute(safeNext), replace: true });
  }

  async function onLogin(values: z.infer<typeof loginSchema>) {
    setPending(true);
    setFormError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      if (error) {
        const message = friendlyAuthError(error);
        setFormError(message);
        toast.error(message);
        return;
      }
      const session = await waitForSession(4000, data.session);
      if (!session?.user) {
        const message = "Signed in, but your account could not be opened. Please try again.";
        setFormError(message);
        toast.error(message);
        return;
      }
      void logAuthEvent("Login");
      await finishSignIn(session.user);
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
        toast.success("Check your email to confirm your account, then sign in.");
        return;
      }
      const session = await waitForSession(4000, data.session);
      if (session?.user) {
        await supabase
          .from("profiles")
          .update({ full_name: values.fullName, phone: values.phone })
          .eq("id", session.user.id);
      }
      void logAuthEvent("Login", values.email);
      await finishSignIn(session?.user ?? data.user);
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
            Browse freely. Sign in only when you want your account or checkout.
          </p>
        </div>
        <p className="text-xs opacity-70">Bookshelf Store</p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {emailSent ? (
            <div className="card-elevated p-6 text-center">
              <h2 className="font-display text-xl font-semibold">Confirm your email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link. After you confirm, come back here and sign in.
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
                    ? "Sign in to finish checkout. Your cart stays with you."
                    : "Sign in anytime. You do not need books in your cart."}
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
                        <FormControl><PasswordInput placeholder="Your password" autoComplete="current-password" {...field} /></FormControl>
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
                  New customers can create an account first. We then take you back to checkout.
                </p>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegister)} className="mt-6 space-y-4">
                    <FormField control={registerForm.control} name="fullName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full name</FormLabel>
                        <FormControl><Input placeholder="Ada Okoro" autoComplete="name" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={registerForm.control} name="phone" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone number</FormLabel>
                        <FormControl><Input type="tel" placeholder="e.g. 0803 000 1234" autoComplete="tel" {...field} /></FormControl>
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
                        <FormControl><PasswordInput placeholder="At least 6 characters" autoComplete="new-password" {...field} /></FormControl>
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
