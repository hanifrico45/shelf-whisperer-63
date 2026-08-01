import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Barcode,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { ReceiptDialog } from "@/components/pos/ReceiptDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { currency } from "@/lib/inventory";
import {
  PAYMENT_LABELS,
  checkoutSale,
  computeTotals,
  fetchSale,
  findByCode,
  searchPosBooks,
  round2,
  type CartLine,
  type PaymentLine,
  type PaymentMethod,
  type PosBook,
  type SaleRow,
} from "@/lib/pos";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "Point of Sale — Bookshelf Inventory" },
      {
        name: "description",
        content:
          "Scan or search books, build a cart, apply discounts and tax, take split payments and print receipts.",
      },
      { property: "og:title", content: "Point of Sale — Bookshelf Inventory" },
      { property: "og:description", content: "Sell books and update stock in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

function PosPage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [scan, setScan] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [primaryMethod, setPrimaryMethod] = useState<PaymentMethod>("cash");
  const [amounts, setAmounts] = useState<Record<PaymentMethod, string>>({
    cash: "",
    card: "",
    transfer: "",
  });
  const [reference, setReference] = useState("");
  const [receiptSale, setReceiptSale] = useState<SaleRow | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(timeout);
  }, [term]);

  const booksQuery = useQuery({
    queryKey: ["pos-books", debounced],
    queryFn: () => searchPosBooks(debounced),
  });

  useEffect(() => {
    const channel = supabase
      .channel("pos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pos-books"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "books" }, () => {
        queryClient.invalidateQueries({ queryKey: ["pos-books"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const totals = useMemo(
    () => computeTotals(lines, discountType, Number(discountValue) || 0, Number(taxRate) || 0),
    [lines, discountType, discountValue, taxRate],
  );

  const paid = useMemo(() => {
    if (!splitMode) return round2(Number(amounts[primaryMethod]) || 0);
    return round2(METHODS.reduce((sum, m) => sum + (Number(amounts[m]) || 0), 0));
  }, [amounts, splitMode, primaryMethod]);

  const balance = round2(totals.total - paid);

  function addBook(book: PosBook) {
    const stock = book.inventory?.quantity ?? 0;
    if (stock <= 0) {
      toast.error(`${book.title} is out of stock`);
      return;
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.book_id === book.id);
      if (existing) {
        if (existing.quantity >= stock) {
          toast.error(`Only ${stock} in stock`);
          return prev;
        }
        return prev.map((l) =>
          l.book_id === book.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          book_id: book.id,
          title: book.title,
          author: book.author,
          unit_price: Number(book.selling_price),
          quantity: 1,
          stock,
          cover_url: book.cover_url,
        },
      ];
    });
  }

  function setQuantity(bookId: string, quantity: number) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.book_id !== bookId) return [l];
        if (quantity <= 0) return [];
        if (quantity > l.stock) {
          toast.error(`Only ${l.stock} in stock`);
          return [{ ...l, quantity: l.stock }];
        }
        return [{ ...l, quantity }];
      }),
    );
  }

  async function handleScan(event: React.FormEvent) {
    event.preventDefault();
    const code = scan.trim();
    if (!code) return;
    setScan("");
    try {
      const book = await findByCode(code);
      if (!book) {
        toast.error(`No book matches "${code}"`);
        return;
      }
      addBook(book);
      toast.success(`${book.title} added`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      scanRef.current?.focus();
    }
  }

  const checkout = useMutation({
    mutationFn: async () => {
      const payments: PaymentLine[] = (splitMode ? METHODS : [primaryMethod])
        .map((method) => ({
          method,
          amount: round2(Number(amounts[method]) || 0),
          reference: method === "cash" ? "" : reference,
        }))
        .filter((p) => p.amount > 0);

      const result = await checkoutSale({
        items: lines.map((l) => ({ book_id: l.book_id, quantity: l.quantity })),
        customerName,
        discountType,
        discountValue: Number(discountValue) || 0,
        taxRate: Number(taxRate) || 0,
        payments,
        notes,
      });
      return fetchSale(result.sale_id);
    },
    onSuccess: (sale) => {
      setReceiptSale(sale);
      setLines([]);
      setCustomerName("");
      setDiscountValue("0");
      setNotes("");
      setReference("");
      setAmounts({ cash: "", card: "", transfer: "" });
      queryClient.invalidateQueries({ queryKey: ["pos-books"] });
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["books-light"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast.success(`Sale ${sale.sale_number} completed`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canCheckout = lines.length > 0 && balance <= 0.001 && !checkout.isPending;

  return (
    <AppShell title="Point of Sale" description="Sell books and update stock instantly">
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <div className="card-elevated p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search title, author or ISBN"
                  className="pl-9"
                  aria-label="Search books"
                />
              </div>
              <form onSubmit={handleScan} className="relative">
                <Barcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  placeholder="Scan barcode and press Enter"
                  className="pl-9"
                  aria-label="Scan barcode"
                />
              </form>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {booksQuery.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))
            ) : (booksQuery.data ?? []).length === 0 ? (
              <div className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No books match this search.
              </div>
            ) : (
              booksQuery.data!.map((book) => {
                const stock = book.inventory?.quantity ?? 0;
                return (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => addBook(book)}
                    disabled={stock <= 0}
                    className="card-elevated flex flex-col items-start p-4 text-left transition hover:border-primary/40 disabled:opacity-50"
                  >
                    <p className="line-clamp-2 font-medium">{book.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{book.author}</p>
                    <div className="mt-3 flex w-full items-center justify-between">
                      <span className="font-display font-semibold">
                        {currency(Number(book.selling_price))}
                      </span>
                      <Badge variant={stock > 0 ? "secondary" : "destructive"}>
                        {stock > 0 ? `${stock} in stock` : "Out of stock"}
                      </Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card-elevated p-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-accent" />
              <h2 className="font-display text-lg font-semibold">Cart</h2>
              <Badge variant="secondary" className="ml-auto">
                {lines.reduce((s, l) => s + l.quantity, 0)} items
              </Badge>
            </div>

            <div className="mt-3 space-y-2">
              {lines.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Scan or tap a book to start a sale.
                </p>
              ) : (
                lines.map((line) => (
                  <div
                    key={line.book_id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{line.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {currency(line.unit_price)} each
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${line.title}`}
                        onClick={() => setQuantity(line.book_id, 0)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="Decrease quantity"
                          onClick={() => setQuantity(line.book_id, line.quantity - 1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <Input
                          value={line.quantity}
                          onChange={(e) =>
                            setQuantity(line.book_id, Number(e.target.value) || 0)
                          }
                          className="h-8 w-14 text-center"
                          aria-label={`Quantity for ${line.title}`}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          aria-label="Increase quantity"
                          onClick={() => setQuantity(line.book_id, line.quantity + 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <span className="font-display font-semibold tabular-nums">
                        {currency(line.unit_price * line.quantity)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card-elevated space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="customer">Customer (optional)</Label>
                <Input
                  id="customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tax">Tax rate %</Label>
                <Input
                  id="tax"
                  inputMode="decimal"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="discount">Discount</Label>
                <Input
                  id="discount"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="discount-type">Discount type</Label>
                <Select
                  value={discountType}
                  onValueChange={(v) => setDiscountType(v as "amount" | "percent")}
                >
                  <SelectTrigger id="discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">Fixed amount</SelectItem>
                    <SelectItem value="percent">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <SummaryRow label="Subtotal" value={currency(totals.subtotal)} />
              <SummaryRow label="Discount" value={`- ${currency(totals.discountAmount)}`} />
              <SummaryRow label="Tax" value={currency(totals.taxAmount)} />
              <div className="flex justify-between font-display text-lg font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{currency(totals.total)}</span>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label htmlFor="split">Split payment</Label>
              <Button
                id="split"
                type="button"
                variant={splitMode ? "default" : "outline"}
                size="sm"
                onClick={() => setSplitMode((v) => !v)}
              >
                {splitMode ? "On" : "Off"}
              </Button>
            </div>

            {splitMode ? (
              <div className="space-y-2">
                {METHODS.map((method) => (
                  <div key={method} className="flex items-center gap-2">
                    <span className="w-20 text-sm text-muted-foreground">
                      {PAYMENT_LABELS[method]}
                    </span>
                    <Input
                      inputMode="decimal"
                      value={amounts[method]}
                      onChange={(e) =>
                        setAmounts((prev) => ({ ...prev, [method]: e.target.value }))
                      }
                      placeholder="0.00"
                      aria-label={`${PAYMENT_LABELS[method]} amount`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((method) => (
                    <Button
                      key={method}
                      type="button"
                      variant={primaryMethod === method ? "default" : "outline"}
                      onClick={() => setPrimaryMethod(method)}
                    >
                      {PAYMENT_LABELS[method]}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="decimal"
                    value={amounts[primaryMethod]}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [primaryMethod]: e.target.value }))
                    }
                    placeholder="Amount received"
                    aria-label="Amount received"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setAmounts((prev) => ({
                        ...prev,
                        [primaryMethod]: totals.total.toFixed(2),
                      }))
                    }
                  >
                    Exact
                  </Button>
                </div>
              </div>
            )}

            {primaryMethod !== "cash" || splitMode ? (
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Payment reference (optional)"
                aria-label="Payment reference"
              />
            ) : null}

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Sale notes (optional)"
              rows={2}
            />

            <div className="space-y-1 text-sm">
              <SummaryRow label="Paid" value={currency(paid)} />
              <SummaryRow
                label={balance > 0 ? "Balance due" : "Change"}
                value={currency(Math.abs(balance))}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setLines([]);
                  setAmounts({ cash: "", card: "", transfer: "" });
                }}
                disabled={lines.length === 0}
              >
                <X className="mr-2 size-4" /> Clear
              </Button>
              <Button
                className="flex-1"
                disabled={!canCheckout}
                onClick={() => checkout.mutate()}
              >
                {checkout.isPending ? "Processing…" : "Complete sale"}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <ReceiptDialog
        sale={receiptSale}
        open={receiptSale !== null}
        onOpenChange={(open) => !open && setReceiptSale(null)}
      />
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
