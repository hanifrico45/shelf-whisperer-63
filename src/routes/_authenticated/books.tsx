import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Download,
  Library,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { BookDialog } from "@/components/books/BookDialog";
import { CoverImage } from "@/components/books/CoverImage";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  archiveBook,
  currency,
  deleteBook,
  fetchBooks,
  fetchRefTable,
  type BookRow,
} from "@/lib/inventory";

const PAGE_SIZE = 10;

export const Route = createFileRoute("/_authenticated/books")({
  head: () => ({
    meta: [
      { title: "Books — Bookshelf Inventory" },
      { name: "description", content: "Add, edit, archive and search every title in your store." },
      { property: "og:title", content: "Books — Bookshelf Inventory" },
      { property: "og:description", content: "Manage your bookstore catalog and stock." },
    ],
  }),
  component: BooksPage,
});

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  archived: "secondary",
  out_of_stock: "destructive",
  discontinued: "outline",
};

function BooksPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BookRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BookRow | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchRefTable("categories") });
  const publishers = useQuery({ queryKey: ["publishers"], queryFn: () => fetchRefTable("publishers") });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => fetchRefTable("suppliers") });

  const booksQuery = useQuery({
    queryKey: ["books", debounced, categoryId, status, page],
    queryFn: () =>
      fetchBooks({ search: debounced, categoryId, status, page, pageSize: PAGE_SIZE }),
  });

  useEffect(() => {
    const channel = supabase
      .channel("books-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "books" }, () => {
        queryClient.invalidateQueries({ queryKey: ["books"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        queryClient.invalidateQueries({ queryKey: ["books"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const archiveMutation = useMutation({
    mutationFn: archiveBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast.success("Book archived");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBook,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast.success("Book deleted");
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = booksQuery.data?.rows ?? [];
  const total = booksQuery.data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const headerActions = useMemo(
    () => (
      <>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => toast.info("CSV import lands in a later phase")}
        >
          <Upload className="size-4" /> Import
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => toast.info("CSV export lands in a later phase")}
        >
          <Download className="size-4" /> Export
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" /> Add book
        </Button>
      </>
    ),
    [],
  );

  return (
    <AppShell title="Books" description="Catalog, pricing and stock levels" actions={headerActions}>
      <div className="card-elevated p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
            <SelectTrigger className="md:w-48">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="md:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="out_of_stock">Out of stock</SelectItem>
              <SelectItem value="discontinued">Discontinued</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 card-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Cover</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Publisher</TableHead>
              <TableHead className="hidden lg:table-cell">Shelf</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {booksQuery.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={10}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10}>
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
                      <Library className="size-5 text-secondary-foreground" />
                    </span>
                    <div>
                      <p className="font-display text-lg font-semibold">No books found</p>
                      <p className="text-sm text-muted-foreground">
                        Adjust your filters, or add your first title to the catalog.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setEditing(null);
                        setDialogOpen(true);
                      }}
                    >
                      <Plus className="size-4" /> Add book
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((book) => {
                const qty = book.inventory?.quantity ?? 0;
                const min = book.inventory?.minimum_stock_level ?? 0;
                return (
                  <TableRow key={book.id}>
                    <TableCell>
                      <CoverImage path={book.cover_url} alt={book.title} className="h-14 w-10" />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{book.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {book.author}
                        {book.isbn ? ` · ${book.isbn}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {book.categories?.name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {book.publishers?.name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {book.inventory?.shelf_location ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {currency(Number(book.purchase_cost))}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {currency(Number(book.selling_price))}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          qty === 0
                            ? "font-semibold text-destructive"
                            : qty <= min
                              ? "font-semibold text-warning"
                              : "font-medium"
                        }
                      >
                        {qty}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[book.status] ?? "secondary"}>
                        {book.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Actions">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(book);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => archiveMutation.mutate(book)}
                            disabled={book.status === "archived"}
                          >
                            <Archive className="size-4" /> Archive
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setPendingDelete(book)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <p>
          {total} {total === 1 ? "title" : "titles"} · page {page + 1} of {pageCount}
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
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <BookDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        book={editing}
        categories={categories.data ?? []}
        publishers={publishers.data ?? []}
        suppliers={suppliers.data ?? []}
      />

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this book?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" and its stock record will be permanently removed. Consider
              archiving instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
