import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShoppingCart, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ShopShell } from "@/components/shop/ShopShell";
import { CoverImage } from "@/components/books/CoverImage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currency } from "@/lib/inventory";
import { addToCart, fetchShopBooks, fetchShopCategories } from "@/lib/shop";

const PAGE_SIZE = 12;

export const Route = createFileRoute("/_shop/shop")({
  head: () => ({
    meta: [
      { title: "Browse books — Bookshelf Store" },
      {
        name: "description",
        content: "Browse, search and buy books from the Bookshelf online bookstore.",
      },
      { property: "og:title", content: "Browse books — Bookshelf Store" },
      { property: "og:description", content: "Find your next read and check out in seconds." },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [sort, setSort] = useState<"title" | "price_asc" | "price_desc">("title");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [page, setPage] = useState(0);

  const categoriesQuery = useQuery({ queryKey: ["shop-categories"], queryFn: fetchShopCategories });
  const booksQuery = useQuery({
    queryKey: ["shop-books", search, categoryId, sort, inStockOnly, page],
    queryFn: () =>
      fetchShopBooks({ search, categoryId, sort, inStockOnly, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const addMutation = useMutation({
    mutationFn: (bookId: string) => addToCart(bookId, 1),
    onSuccess: () => {
      toast.success("Added to cart");
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not add to cart"),
  });

  const rows = booksQuery.data?.rows ?? [];
  const total = booksQuery.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ShopShell>
      <section className="rounded-2xl bg-gradient-brand px-6 py-10 text-primary-foreground">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Find your next read</h1>
        <p className="mt-2 max-w-md text-sm opacity-85">
          Hand-picked titles, live stock and instant checkout.
        </p>
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search title, author or ISBN"
            className="pl-9"
          />
        </div>
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categoriesQuery.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="title">Title A–Z</SelectItem>
            <SelectItem value="price_asc">Price: low to high</SelectItem>
            <SelectItem value="price_desc">Price: high to low</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="in-stock" checked={inStockOnly} onCheckedChange={setInStockOnly} />
          <Label htmlFor="in-stock" className="text-sm text-muted-foreground">
            In stock
          </Label>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {booksQuery.isLoading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-xl" />)
          : rows.map((book) => {
              const stock = book.inventory?.quantity ?? 0;
              return (
                <div key={book.id} className="card-elevated flex flex-col overflow-hidden">
                  <Link
                    to="/shop/$bookId"
                    params={{ bookId: book.id }}
                    className="block bg-muted/40 p-4"
                  >
                    <CoverImage
                      path={book.cover_url}
                      alt={book.title}
                      className="mx-auto aspect-[2/3] w-28"
                    />
                  </Link>
                  <div className="flex flex-1 flex-col gap-1 p-4 pt-0">
                    <Link
                      to="/shop/$bookId"
                      params={{ bookId: book.id }}
                      className="line-clamp-2 font-medium hover:underline"
                    >
                      {book.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{book.author}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-display text-lg font-semibold">
                        {currency(Number(book.selling_price))}
                      </span>
                      {stock > 0 ? (
                        <Badge variant="secondary">{stock} in stock</Badge>
                      ) : (
                        <Badge variant="outline">Sold out</Badge>
                      )}
                    </div>
                    <Button
                      className="mt-3 w-full"
                      size="sm"
                      disabled={stock <= 0 || addMutation.isPending}
                      onClick={() => addMutation.mutate(book.id)}
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
                </div>
              );
            })}
      </div>

      {!booksQuery.isLoading && rows.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          No books match your search yet.
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {page + 1} of {pages} · {total} titles
        </p>
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
    </ShopShell>
  );
}
