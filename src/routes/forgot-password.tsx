import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({ email: z.string().trim().email("Enter a valid email").max(255) });

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password — Bookshelf" },
      { name: "description", content: "Request a password reset link for your Bookshelf account." },
      { property: "og:title", content: "Reset your password — Bookshelf" },
      { property: "og:description", content: "Request a password reset link." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: z.infer<typeof schema>) {
    setPending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success("Reset link sent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm card-elevated p-6">
        {sent ? (
          <div className="text-center">
            <MailCheck className="mx-auto size-8 text-accent" />
            <h1 className="mt-4 font-display text-xl font-semibold">Check your inbox</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for that email, a reset link is on its way.
            </p>
            <Button asChild className="mt-5 w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold">Forgot password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll email you a link to set a new one.
            </p>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@bookstore.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : "Send reset link"}
                </Button>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/auth">Back to sign in</Link>
                </Button>
              </form>
            </Form>
          </>
        )}
      </div>
    </div>
  );
}
