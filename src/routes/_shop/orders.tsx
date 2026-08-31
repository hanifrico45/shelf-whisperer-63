import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";

import { ShopShell } from "@/components/shop/ShopShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/inventory";
import { fetchMyOrders, ORDER_STATUS_LABEL } from "@/lib/shop";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_shop/orders")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "My orders — Bookshelf Store" },
      { name: "description", content: "Track the status of your Bookshelf book orders." },
      { property: "og:title", content: "My orders — Bookshelf Store" },
      { property: "og:description", content: "Order history and live delivery status." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const ordersQuery = useQuery({ queryKey: ["my-orders"], queryFn: fetchMyOrders });
  const orders = ordersQuery.data ?? [];

  return (
    <ShopShell>
      <h1 className="font-display text-2xl font-semibold">My orders</h1>

      {ordersQuery.isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border py-16 text-center">
          <Package className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">You haven't placed any orders yet.</p>
          <Button className="mt-4" asChild>
            <Link to="/shop">Browse books</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="card-elevated p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{order.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={order.status === "delivered" ? "default" : "secondary"}>
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </Badge>
                  <span className="font-display text-lg font-semibold">
                    {currency(Number(order.total))}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
                {(order.sales?.sale_items ?? []).map((item) => (
                  <div key={item.id} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {item.quantity} × {item.title}
                    </span>
                    <span>{currency(Number(item.line_total))}</span>
                  </div>
                ))}
              </div>

              <OrderTracker status={order.status} />
            </div>
          ))}
        </div>
      )}
    </ShopShell>
  );
}

const STEPS = ["processing", "packed", "shipped", "delivered"] as const;

function OrderTracker({ status }: { status: string }) {
  if (status === "cancelled") {
    return <p className="mt-4 text-xs text-destructive">This order was cancelled.</p>;
  }
  const current = Math.max(0, STEPS.indexOf(status as (typeof STEPS)[number]));
  return (
    <div className="mt-4 flex items-center gap-2">
      {STEPS.map((step, index) => (
        <div key={step} className="flex flex-1 flex-col gap-1">
          <div
            className={`h-1.5 rounded-full ${index <= current ? "bg-primary" : "bg-muted"}`}
            aria-hidden
          />
          <span className="text-[10px] capitalize text-muted-foreground">{step}</span>
        </div>
      ))}
    </div>
  );
}
