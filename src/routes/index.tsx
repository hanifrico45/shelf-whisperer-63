import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BookOpen, BarChart3, ShieldCheck, Boxes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Bookshelf — Bookstore Inventory Management" },
      {
        name: "description",
        content:
          "Track titles, stock levels, suppliers and staff activity for your bookstore in one workspace.",
      },
      { property: "og:title", content: "Bookshelf — Bookstore Inventory Management" },
      {
        property: "og:description",
        content: "Track titles, stock levels, suppliers and staff activity in one workspace.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Boxes, title: "Live inventory", body: "Stock levels, shelf locations and low-stock alerts." },
  { icon: BarChart3, title: "Value at a glance", body: "Inventory cost and retail value on one dashboard." },
  { icon: ShieldCheck, title: "Roles & audit trail", body: "Owner and customer accounts with full history." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
            <BookOpen className="size-5" />
          </span>
          <span className="font-display text-lg font-semibold">Bookshelf</span>
        </div>
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="pt-12 md:pt-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Bookstore operations
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight md:text-6xl">
            Every title, every copy, accounted for.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground md:text-lg">
            Bookshelf is the inventory backbone for independent bookstores — catalog, stock,
            suppliers, roles and a complete audit trail.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth" search={{ mode: "register" }}>
                Create an account
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card-elevated p-6">
              <f.icon className="size-5 text-accent" />
              <h2 className="mt-4 font-display text-lg font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
