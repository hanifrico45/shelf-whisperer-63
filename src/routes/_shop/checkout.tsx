import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ShopShell } from "@/components/shop/ShopShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { currency } from "@/lib/inventory";
import { fetchCart, placeOrder } from "@/lib/shop";
import { supabase } from "@/integrations/supabase/client";

const TAX_RATE = 7.5;

export const Route = createFileRoute("/_shop/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — Bookshelf Store" },
      { name: "description", content: "Complete your book order with cash, card or transfer." },
      { property: "og:title", content: "Checkout — Bookshelf Store" },
      { property: "og:description", content: "Secure checkout for your Bookshelf order." },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const cartQuery = useQuery({ queryKey: ["cart"], queryFn: fetchCart });

  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("card");
  const [placed, setPlaced] = useState<{ order_number: string; total: number } | null>(null);

  const rows = cartQuery.data ?? [];
  const subtotal = rows.reduce((sum, r) => sum + Number(r.books?.selling_price ?? 0) * r.quantity, 0);
  const tax = Math.round(subtotal * (TAX_RATE / 100) * 100) / 100;
  const total = subtotal + tax;

  const orderMutation = useMutation({
    mutationFn: () =>
      placeOrder({
        paymentMethod: method,
        shippingAddress: address.trim(),
        contactPhone: phone.trim(),
        taxRate: TAX_RATE,
        notes: notes.trim(),
      }),
    onSuccess: (result) => {
      setPlaced({ order_number: result.order_number, total: Number(result.total) });
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      toast.success("Order placed successfully");
    },
    onError: (error: Error) => toast.error(error.message || "Checkout failed"),
  });

  if (placed) {
    return (
      <ShopShell>
        <div className="mx-auto max-w-md py-16 text-center">
          <CheckCircle2 className="mx-auto size-12 text-primary" />
          <h1 className="mt-4 font-display text-2xl font-semibold">Thank you for your order</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Order <span className="font-medium text-foreground">{placed.order_number}</span> · {currency(placed.total)}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild><Link to="/orders">View my orders</Link></Button>
            <Button variant="outline" asChild><Link to="/shop">Keep browsing</Link></Button>
          </div>
        </div>
      </ShopShell>
    );
  }

  if (userQuery.isLoading) {
    return (
      <ShopShell>
        <Skeleton className="h-72 rounded-xl" />
      </ShopShell>
    );
  }

  if (!userQuery.data) {
    return (
      <ShopShell>
        <h1 className="font-display text-2xl font-semibold">Checkout</h1>
        {cartQuery.isLoading ? (
          <Skeleton className="mt-6 h-72 rounded-xl" />
        ) : rows.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            Your cart is empty. <Link to="/shop" className="underline">Browse books</Link>
          </div>
        ) : (
          <div className="mx-auto mt-8 max-w-lg card-elevated p-6 text-center">
            <h2 className="font-display text-xl font-semibold">Sign in to complete your order</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your {rows.reduce((sum, row) => sum + row.quantity, 0)} cart items will be saved to your account after you sign in.
            </p>
            <p className="mt-4 font-display text-2xl font-semibold">{currency(total)}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button size="lg" asChild>
                <Link to="/auth" search={{ mode: "login", next: "/checkout" }}>Sign in</Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link to="/auth" search={{ mode: "register", next: "/checkout" }}>Create account</Link>
              </Button>
            </div>
            <Button variant="link" className="mt-3" asChild>
              <Link to="/cart">Back to cart</Link>
            </Button>
          </div>
        )}
      </ShopShell>
    );
  }

  const canSubmit = rows.length > 0 && address.trim().length > 4 && phone.trim().length > 5;

  return (
    <ShopShell>
      <h1 className="font-display text-2xl font-semibold">Checkout</h1>
      {cartQuery.isLoading ? (
        <Skeleton className="mt-6 h-72 rounded-xl" />
      ) : rows.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Your cart is empty. <Link to="/shop" className="underline">Browse books</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="card-elevated space-y-4 p-5">
            <h2 className="font-display text-lg font-semibold">Delivery details</h2>
            <div className="space-y-2">
              <Label htmlFor="address">Shipping address</Label>
              <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state" rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Contact phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0803 000 1234" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Order notes (optional)</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Delivery instructions" />
            </div>
            <div className="space-y-2 pt-2">
              <Label>Payment method</Label>
              <RadioGroup value={method} onValueChange={(v) => setMethod(v as typeof method)} className="grid gap-2 sm:grid-cols-3">
                {(["card", "cash", "transfer"] as const).map((m) => (
                  <Label key={m} htmlFor={`pay-${m}`} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm capitalize has-[:checked]:border-primary">
                    <RadioGroupItem id={`pay-${m}`} value={m} />
                    {m === "cash" ? "Cash on delivery" : m}
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </div>
          <div className="card-elevated h-fit p-5">
            <h2 className="font-display text-lg font-semibold">Order summary</h2>
            <div className="mt-4 space-y-2 text-sm">
              {rows.map((row) => (
                <div key={row.id} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">{row.quantity} × {row.books?.title}</span>
                  <span>{currency(Number(row.books?.selling_price ?? 0) * row.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{currency(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax ({TAX_RATE}%)</span><span>{currency(tax)}</span></div>
              <div className="flex justify-between font-display text-lg font-semibold"><span>Total</span><span>{currency(total)}</span></div>
            </div>
            <Button className="mt-5 w-full" disabled={!canSubmit || orderMutation.isPending} onClick={() => orderMutation.mutate()}>
              {orderMutation.isPending ? (<><Loader2 className="size-4 animate-spin" /> Placing order…</>) : "Place order"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">Stock is reserved the moment your order is confirmed.</p>
          </div>
        </div>
      )}
    </ShopShell>
  );
}
