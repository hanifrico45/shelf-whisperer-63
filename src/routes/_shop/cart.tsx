import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ShopShell } from "@/components/shop/ShopShell";
import { CoverImage } from "@/components/books/CoverImage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/inventory";
import { fetchCart, removeCartItem, updateCartQuantity } from "@/lib/shop";

export const Route = createFileRoute("/_shop/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — Bookshelf Store" },
      { name: "description", content: "Review the books in your cart before checking out." },
      { property: "og:title", content: "Your cart — Bookshelf Store" },
      { property: "og:description", content: "Review quantities and totals before checkout." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const cartQuery = useQuery({ queryKey: ["cart"], queryFn: fetchCart });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["cart"] });

  const qtyMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      updateCartQuantity(id, quantity),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message || "Could not update quantity"),
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => removeCartItem(id),
    onSuccess: () => {
      toast.success("Removed from cart");
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message || "Could not remove item"),
  });

  const rows = cartQuery.data ?? [];
  const subtotal = rows.reduce(
    (sum, r) => sum + Number(r.books?.selling_price ?? 0) * r.quantity,
    0,
  );

  return (
    <ShopShell>
      <h1 className="font-display text-2xl font-semibold">Your cart</h1>

      {cartQuery.isLoading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border py-16 text-center">
          <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Your cart is empty.</p>
          <Button className="mt-4" asChild>
            <Link to="/shop">Browse books</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {rows.map((row) => {
              const stock = row.books?.inventory?.quantity ?? 0;
              return (
                <div key={row.id} className="card-elevated flex gap-4 p-4">
                  <CoverImage
                    path={row.books?.cover_url ?? null}
                    alt={row.books?.title ?? "Book"}
                    className="h-24 w-16 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{row.books?.title}</p>
                    <p className="text-xs text-muted-foreground">{row.books?.author}</p>
                    <p className="mt-1 text-sm font-medium">
                      {currency(Number(row.books?.selling_price ?? 0))}
                    </p>
                    {row.quantity > stock ? (
                      <p className="mt-1 text-xs text-destructive">Only {stock} left in stock</p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() =>
                          qtyMutation.mutate({ id: row.id, quantity: row.quantity - 1 })
                        }
                        aria-label="Decrease quantity"
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm">{row.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={row.quantity >= stock}
                        onClick={() =>
                          qtyMutation.mutate({ id: row.id, quantity: row.quantity + 1 })
                        }
                        aria-label="Increase quantity"
                      >
                        <Plus className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => removeMutation.mutate(row.id)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="font-display text-lg font-semibold">
                    {currency(Number(row.books?.selling_price ?? 0) * row.quantity)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="card-elevated h-fit p-5">
            <h2 className="font-display text-lg font-semibold">Summary</h2>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{currency(subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Items</span>
              <span className="font-medium">{rows.reduce((s, r) => s + r.quantity, 0)}</span>
            </div>
            <Button className="mt-5 w-full" onClick={() => navigate({ to: "/checkout" })}>
              Proceed to checkout
            </Button>
            <Button variant="ghost" className="mt-2 w-full" asChild>
              <Link to="/shop">Keep browsing</Link>
            </Button>
          </div>
        </div>
      )}
    </ShopShell>
  );
}
