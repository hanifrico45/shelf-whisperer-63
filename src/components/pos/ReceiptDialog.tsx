import { Printer } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { currency } from "@/lib/inventory";
import { PAYMENT_LABELS, registerReprint, type SaleRow } from "@/lib/pos";

export function ReceiptDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: SaleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const receipt = sale?.receipts?.[0];

  async function handlePrint() {
    if (receipt) {
      try {
        await registerReprint(receipt.id, receipt.print_count);
      } catch {
        toast.error("Could not record the reprint");
      }
    }
    window.print();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Receipt</DialogTitle>
          <DialogDescription>
            {receipt ? `Receipt ${receipt.receipt_number}` : "Sale summary"}
          </DialogDescription>
        </DialogHeader>

        {sale ? (
          <div id="receipt-printable" className="rounded-lg border border-border p-4 text-sm">
            <div className="text-center">
              <p className="font-display text-lg font-semibold">Bookshelf</p>
              <p className="text-xs text-muted-foreground">Point of Sale receipt</p>
            </div>
            <Separator className="my-3" />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Sale: {sale.sale_number}</p>
              <p>Date: {new Date(sale.created_at).toLocaleString()}</p>
              {sale.customer_name ? <p>Customer: {sale.customer_name}</p> : null}
              {receipt && receipt.print_count > 0 ? (
                <p>Reprints: {receipt.print_count}</p>
              ) : null}
            </div>
            <Separator className="my-3" />
            <div className="space-y-2">
              {sale.sale_items.map((item) => (
                <div key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.quantity} × {currency(Number(item.unit_price))}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {currency(Number(item.line_total))}
                  </span>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <Row label="Subtotal" value={currency(Number(sale.subtotal))} />
            {Number(sale.discount_amount) > 0 ? (
              <Row label="Discount" value={`- ${currency(Number(sale.discount_amount))}`} />
            ) : null}
            <Row label="Tax" value={currency(Number(sale.tax_amount))} />
            <div className="mt-2 flex justify-between font-display text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{currency(Number(sale.total))}</span>
            </div>
            <Separator className="my-3" />
            {sale.transactions.map((t) => (
              <Row
                key={t.id}
                label={`${PAYMENT_LABELS[t.method]}${t.reference ? ` · ${t.reference}` : ""}`}
                value={currency(Number(t.amount))}
              />
            ))}
            <Row label="Change" value={currency(Number(sale.change_due))} />
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Thank you for shopping with us.
            </p>
          </div>
        ) : null}

        <Button onClick={handlePrint} className="w-full">
          <Printer className="mr-2 size-4" /> Print receipt
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
