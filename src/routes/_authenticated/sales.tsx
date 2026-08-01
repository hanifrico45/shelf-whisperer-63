import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Search } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { currency } from "@/lib/inventory";
import { PAYMENT_LABELS, fetchSales, type SaleRow } from "@/lib/pos";

const PAGE_SIZE = 10;

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales History — Bookshelf Inventory" },
      {
        name: "description",
        content: "Browse every completed sale, inspect line items and reprint receipts.",
      },
      { property: "og:title", content: "Sales History — Bookshelf Inventory" },
      { property: "og:description", content: "Every sale, payment and receipt in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SaleRow | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const salesQuery = useQuery({
    queryKey: ["sales", debounced, page],
    queryFn: () => fetchSales(debounced, page, PAGE_SIZE),
  });

  useEffect(() => {
    const channel = supabase
      .channel("sales-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        queryClient.invalidateQueries({ queryKey: ["sales"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "receipts" }, () => {
        queryClient.invalidateQueries({ queryKey: ["sales"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const rows = salesQuery.data?.rows ?? [];
  const count = salesQuery.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <AppShell title="Sales History" description="Every completed sale and its receipt">
      <div className="card-elevated p-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sale number or customer"
            className="pl-9"
            aria-label="Search sales"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          {salesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No sales recorded yet. Completed checkouts appear here instantly.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sale</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium">{sale.sale_number}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(sale.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{sale.customer_name ?? "Walk-in"}</TableCell>
                    <TableCell>
                      {sale.sale_items.reduce((s, i) => s + i.quantity, 0)}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {sale.transactions.map((t) => (
                        <Badge key={t.id} variant="secondary">
                          {PAYMENT_LABELS[t.method]}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {currency(Number(sale.total))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(sale)}>
                        <Receipt className="mr-2 size-4" /> Reprint
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {rows.length > 0 ? (
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {page + 1} of {pages} · {count} sales
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <ReceiptDialog
        sale={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </AppShell>
  );
}
