import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
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

const schema = z
  .object({
    password: z.string().min(6, "At least 6 characters").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Bookshelf" },
      { name: "description", content: "Choose a new password for your Bookshelf account." },
      { property: "og:title", content: "Set a new password — Bookshelf" },
      { property: "og:description", content: "Choose a new password for your account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  useEffect(() => {
    const hash = window.location.hash;
    const isRecovery = hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data }) => {
      setReady(Boolean(data.session) || isRecovery);
    });
  }, []);

  async function onSubmit(values: z.infer<typeof schema>) {
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password: values.password });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm card-elevated p-6">
        <h1 className="font-display text-2xl font-semibold">Set a new password</h1>
        {!ready ? (
          <p className="mt-2 text-sm text-muted-foreground">
            This link looks invalid or expired.{" "}
            <Link to="/forgot-password" className="underline underline-offset-4">
              Request a new one
            </Link>
            .
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : "Update password"}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
