import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BookCopy,
  Library,
  PackageX,
  Receipt,
  Wallet,
  History,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { currency, fetchAllBooksLight, fetchAuditLogs } from "@/lib/inventory";
import { fetchSales, fetchSalesSummary } from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Bookshelf Inventory" },
      { name: "description", content: "Stock value, low stock alerts and recent staff activity." },
      { property: "og:title", content: "Dashboard — Bookshelf Inventory" },
      { property: "og:description", content: "Stock value, alerts and recent activity." },
    ],
  }),
  component: DashboardPage,
});

const monthlyPlaceholder = [
  { month: "Jan", stock: 0 },
  { month: "Feb", stock: 0 },
  { month: "Mar", stock: 0 },
  { month: "Apr", stock: 0 },
  { month: "May", stock: 0 },
  { month: "Jun", stock: 0 },
];

function DashboardPage() {
  const queryClient = useQueryClient();

  const booksQuery = useQuery({ queryKey: ["books-light"], queryFn: fetchAllBooksLight });
  const auditQuery = useQuery({ queryKey: ["audit"], queryFn: () => fetchAuditLogs(8) });
  const salesQuery = useQuery({
    queryKey: ["dashboard-sales"],
    queryFn: () => fetchSales("", 0, 100),
  });
  const summaryQuery = useQuery({
    queryKey: ["sales-summary"],
    queryFn: fetchSalesSummary,
  });

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "books" }, () => {
        queryClient.invalidateQueries({ queryKey: ["books-light"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        queryClient.invalidateQueries({ queryKey: ["books-light"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["audit"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-sales"] });
        queryClient.invalidateQueries({ queryKey: ["sales-summary"] });
        queryClient.invalidateQueries({ queryKey: ["books-light"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const books = booksQuery.data ?? [];
  const totalCopies = books.reduce((sum, b) => sum + (b.inventory?.quantity ?? 0), 0);
  const inventoryValue = books.reduce(
    (sum, b) => sum + Number(b.purchase_cost) * (b.inventory?.quantity ?? 0),
    0,
  );
  const retailValue = books.reduce(
    (sum, b) => sum + Number(b.selling_price) * (b.inventory?.quantity ?? 0),
    0,
  );
  const lowStock = books.filter(
    (b) =>
      (b.inventory?.quantity ?? 0) > 0 &&
      (b.inventory?.quantity ?? 0) <= (b.inventory?.minimum_stock_level ?? 0),
  ).length;
  const outOfStock = books.filter((b) => (b.inventory?.quantity ?? 0) === 0).length;

  const sales = salesQuery.data?.rows ?? [];
  const today = new Date().toDateString();
  const todaySales = sales.filter((s) => new Date(s.created_at).toDateString() === today);
  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total), 0);

  const cards = [
    { label: "Sales Today", value: todaySales.length.toString(), icon: Receipt, hint: "completed checkouts" },
    { label: "Revenue Today", value: currency(todayRevenue), icon: Wallet, hint: "gross takings" },
    { label: "Total Books", value: totalCopies.toLocaleString(), icon: BookCopy, hint: "copies in stock" },
    { label: "Different Titles", value: books.length.toLocaleString(), icon: Library, hint: "unique SKUs" },
    { label: "Inventory Value", value: currency(inventoryValue), icon: Wallet, hint: "at purchase cost" },
    { label: "Retail Value", value: currency(retailValue), icon: Receipt, hint: "at selling price" },
    { label: "Low Stock", value: lowStock.toString(), icon: AlertTriangle, hint: "at or below minimum" },
    { label: "Out of Stock", value: outOfStock.toString(), icon: PackageX, hint: "need reordering" },
  ];

  const summary = summaryQuery.data;
  const summaryPeriods = [
    { label: "Today", hint: "since midnight", ...(summary?.today ?? { total: 0, count: 0 }) },
    { label: "This week", hint: "from Monday", ...(summary?.week ?? { total: 0, count: 0 }) },
    { label: "This month", hint: "month to date", ...(summary?.month ?? { total: 0, count: 0 }) },
    { label: "This year", hint: "year to date", ...(summary?.year ?? { total: 0, count: 0 }) },
  ];

  const topTitles = [...books]
    .sort((a, b) => (b.inventory?.quantity ?? 0) - (a.inventory?.quantity ?? 0))
    .slice(0, 6)
    .map((b) => ({ name: b.title.slice(0, 12), qty: b.inventory?.quantity ?? 0 }));

  return (
    <AppShell title="Dashboard" description="Live snapshot of your bookstore inventory">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {booksQuery.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : cards.map((card) => (
              <div key={card.label} className="card-elevated p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="mt-2 font-display text-3xl font-semibold">{card.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                  </div>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <card.icon className="size-4" />
                  </span>
                </div>
              </div>
            ))}
      </div>

      <div className="mt-6 card-elevated p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Sales summary</h2>
          <Badge variant="secondary">Completed sales</Badge>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryQuery.isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))
            : summaryPeriods.map((period) => (
                <div key={period.label} className="rounded-xl border border-border p-4">
                  <p className="text-sm text-muted-foreground">{period.label}</p>
                  <p className="mt-2 font-display text-2xl font-semibold tabular-nums">
                    {currency(period.total)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {period.count} {period.count === 1 ? "sale" : "sales"} · {period.hint}
                  </p>
                </div>
              ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card-elevated p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Stock by title</h2>
            <Badge variant="secondary">Top 6</Badge>
          </div>
          <div className="mt-4 h-64">
            {topTitles.length === 0 ? (
              <EmptyChart label="Add books to see stock distribution" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTitles}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} stroke="var(--color-muted-foreground)" />
                  <YAxis fontSize={12} stroke="var(--color-muted-foreground)" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "0.5rem",
                      color: "var(--color-popover-foreground)",
                    }}
                  />
                  <Bar dataKey="qty" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card-elevated p-5">
          <div className="flex items-center gap-2">
            <History className="size-4 text-accent" />
            <h2 className="font-display text-lg font-semibold">Recent activity</h2>
          </div>
          <div className="mt-4 space-y-3">
            {auditQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)
            ) : (auditQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activity yet. Inventory changes will appear here.
              </p>
            ) : (
              auditQuery.data!.map((log) => (
                <div key={log.id} className="rounded-lg border border-border px-3 py-2">
                  <p className="text-sm font-medium">{log.action}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {log.entity_label ?? "—"} · {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 card-elevated p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Stock movement</h2>
          <Badge variant="outline">Placeholder — sales analytics arrive in a later phase</Badge>
        </div>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyPlaceholder}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" fontSize={12} stroke="var(--color-muted-foreground)" />
              <YAxis fontSize={12} stroke="var(--color-muted-foreground)" />
              <Line type="monotone" dataKey="stock" stroke="var(--color-chart-1)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppShell>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}
