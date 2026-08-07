import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { ShopShell } from "@/components/shop/ShopShell";
import { CoverImage } from "@/components/books/CoverImage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/inventory";
import { addToCart, fetchShopBook } from "@/lib/shop";

export const Route = createFileRoute("/_shop/shop/$bookId")({
  head: () => ({
    meta: [
      { title: "Book details — Bookshelf Store" },
      { name: "description", content: "Book details, price and availability at Bookshelf." },
      { property: "og:title", content: "Book details — Bookshelf Store" },
      { property: "og:description", content: "See price, stock and description before you buy." },
    ],
  }),
  component: BookDetailPage,
});

function BookDetailPage() {
  const { bookId } = Route.useParams();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(1);

  const bookQuery = useQuery({
    queryKey: ["shop-book", bookId],
    queryFn: () => fetchShopBook(bookId),
  });

  const addMutation = useMutation({
    mutationFn: () => addToCart(bookId, qty),
    onSuccess: () => {
      toast.success("Added to cart");
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not add to cart"),
  });

  const book = bookQuery.data;
  const stock = book?.inventory?.quantity ?? 0;

  return (
    <ShopShell>
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/shop">
          <ArrowLeft className="size-4" /> Back to browsing
        </Link>
      </Button>

      {bookQuery.isLoading ? (
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <Skeleton className="aspect-[2/3] rounded-xl" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : !book ? (
        <p className="text-sm text-muted-foreground">This book is no longer available.</p>
      ) : (
        <div className="grid gap-8 md:grid-cols-[240px_1fr]">
          <CoverImage path={book.cover_url} alt={book.title} className="aspect-[2/3] w-full" />
          <div>
            <h1 className="font-display text-3xl font-semibold">{book.title}</h1>
            <p className="mt-1 text-muted-foreground">by {book.author}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {book.categories ? <Badge variant="secondary">{book.categories.name}</Badge> : null}
              {book.isbn ? <Badge variant="outline">ISBN {book.isbn}</Badge> : null}
            </div>

            <p className="mt-6 font-display text-3xl font-semibold">
              {currency(Number(book.selling_price))}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {stock > 0 ? `${stock} copies available` : "Currently sold out"}
            </p>

            <div className="mt-5 flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={Math.max(1, stock)}
                value={qty}
                onChange={(e) =>
                  setQty(Math.max(1, Math.min(stock || 1, Number(e.target.value) || 1)))
                }
                className="w-24"
              />
              <Button
                disabled={stock <= 0 || addMutation.isPending}
                onClick={() => addMutation.mutate()}
              >
                {addMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <ShoppingCart className="size-4" /> Add to cart
                  </>
                )}
              </Button>
            </div>

            {book.description ? (
              <div className="mt-8">
                <h2 className="font-display text-lg font-semibold">About this book</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {book.description}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </ShopShell>
  );
}
