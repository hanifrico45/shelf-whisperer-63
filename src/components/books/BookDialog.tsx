import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CoverImage } from "./CoverImage";
import {
  bookSchema,
  createBook,
  updateBook,
  uploadCover,
  type BookFormValues,
  type BookRow,
  type RefRow,
} from "@/lib/inventory";

const NONE = "none";

const emptyValues: BookFormValues = {
  title: "",
  author: "",
  isbn: "",
  barcode: "",
  category_id: "",
  supplier_id: "",
  purchase_cost: 0,
  selling_price: 0,
  quantity: 0,
  minimum_stock_level: 5,
  shelf_location: "",
  status: "active",
  cover_url: "",
};

export function BookDialog({
  open,
  onOpenChange,
  book,
  categories,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  book: BookRow | null;
  categories: RefRow[];
  suppliers: RefRow[];
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const form = useForm<BookFormValues>({
    resolver: zodResolver(bookSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      book
        ? {
            title: book.title,
            author: book.author,
            isbn: book.isbn ?? "",
            barcode: book.barcode ?? "",
            category_id: book.category_id ?? "",
            supplier_id: book.supplier_id ?? "",
            purchase_cost: Number(book.purchase_cost),
            selling_price: Number(book.selling_price),
            quantity: book.inventory?.quantity ?? 0,
            minimum_stock_level: book.inventory?.minimum_stock_level ?? 5,
            shelf_location: book.inventory?.shelf_location ?? "",
            status: book.status,
            cover_url: book.cover_url ?? "",
          }
        : emptyValues,
    );
  }, [open, book, form]);

  const mutation = useMutation({
    mutationFn: async (values: BookFormValues) =>
      book ? updateBook(book, values) : createBook(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books"] });
      queryClient.invalidateQueries({ queryKey: ["books-light"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
      toast.success(book ? "Book updated" : "Book added");
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleCover(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadCover(file);
      form.setValue("cover_url", path);
      toast.success("Cover uploaded");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const coverPath = form.watch("cover_url");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">{book ? "Edit book" : "Add book"}</DialogTitle>
          <DialogDescription>
            Catalog details and stock information for this title.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-5"
          >
            <div className="flex items-center gap-4">
              <CoverImage path={coverPath || null} alt="Book cover" className="h-24 w-16" />
              <div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Upload cover
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleCover(e.target.files?.[0])}
                  />
                </label>
                <p className="mt-1 text-xs text-muted-foreground">JPG or PNG, up to 5MB.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="The Bookshop" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="author"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Author</FormLabel>
                    <FormControl>
                      <Input placeholder="Penelope Fitzgerald" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isbn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ISBN</FormLabel>
                    <FormControl>
                      <Input placeholder="9780000000000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="barcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Barcode</FormLabel>
                    <FormControl>
                      <Input placeholder="Scan or type" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <RefSelect
                control={form.control}
                name="category_id"
                label="Category"
                options={categories}
              />
              <RefSelect
                control={form.control}
                name="supplier_id"
                label="Supplier"
                options={suppliers}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                        <SelectItem value="out_of_stock">Out of stock</SelectItem>
                        <SelectItem value="discontinued">Discontinued</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="purchase_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Purchase cost</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling price</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="minimum_stock_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum stock level</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shelf_location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shelf location</FormLabel>
                    <FormControl>
                      <Input placeholder="A-12" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : book ? (
                  "Save changes"
                ) : (
                  "Add book"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RefSelect({
  control,
  name,
  label,
  options,
}: {
  control: ReturnType<typeof useForm<BookFormValues>>["control"];
  name: "category_id" | "supplier_id";
  label: string;
  options: RefRow[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={field.value ? field.value : NONE}
            onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
