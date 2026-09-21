import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export type BookStatus = "active" | "archived" | "out_of_stock" | "discontinued";
export type AppRole = "owner" | "customer";

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  customer: "Customer",
};


export interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  barcode: string | null;
  cover_url: string | null;
  description: string | null;
  category_id: string | null;
  supplier_id: string | null;
  purchase_cost: number;
  selling_price: number;
  status: BookStatus;
  created_at: string;
  updated_at: string;
  categories: { id: string; name: string } | null;
  suppliers: { id: string; name: string } | null;
  inventory: {
    id: string;
    quantity: number;
    minimum_stock_level: number;
    shelf_location: string | null;
  } | null;
}

export interface RefRow {
  id: string;
  name: string;
}

export interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  created_at: string;
  user_id: string | null;
}

const sel = (s: string): string => s;

const BOOK_SELECT =
  "id,title,author,isbn,barcode,cover_url,description,category_id,supplier_id,purchase_cost,selling_price,status,created_at,updated_at,categories(id,name),suppliers(id,name),inventory(id,quantity,minimum_stock_level,shelf_location)";

export const bookSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  author: z.string().trim().min(1, "Author is required").max(150),
  isbn: z.string().trim().max(20).optional().or(z.literal("")),
  barcode: z.string().trim().max(50).optional().or(z.literal("")),
  category_id: z.string().optional().or(z.literal("")),
  supplier_id: z.string().optional().or(z.literal("")),
  purchase_cost: z.coerce.number().min(0, "Must be 0 or more"),
  selling_price: z.coerce.number().min(0, "Must be 0 or more"),
  quantity: z.coerce.number().int().min(0, "Must be 0 or more"),
  minimum_stock_level: z.coerce.number().int().min(0, "Must be 0 or more"),
  shelf_location: z.string().trim().max(60).optional().or(z.literal("")),
  status: z.enum(["active", "archived", "out_of_stock", "discontinued"]),
  cover_url: z.string().optional().or(z.literal("")),
});

export type BookFormValues = z.infer<typeof bookSchema>;

const nullable = (value?: string) => (value && value.length > 0 ? value : null);

/** Turns Postgres / network failures into copy a bookseller can act on. */
export function friendlyDbError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return "You're offline — reconnect to save changes.";
  if (/duplicate key|unique constraint/i.test(message))
    return "A book with these details already exists.";
  if (/row-level security|permission denied|not authorized/i.test(message))
    return "You don't have permission to do that.";
  if (/violates foreign key/i.test(message))
    return "This record is linked to other data and can't be changed that way.";
  if (/jwt|session|not authenticated/i.test(message))
    return "Your session expired. Please sign in again.";
  if (/failed to fetch|network/i.test(message))
    return "Couldn't reach the database. Check your connection and retry.";
  return message || "Something went wrong. Please try again.";
}

/** Blocks two books sharing the same ISBN. */
async function assertIsbnAvailable(isbn: string | null, excludeId?: string) {
  if (!isbn) return;
  let query = supabase.from("books").select("id").eq("isbn", isbn).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw new Error(friendlyDbError(error));
  if (data && data.length > 0) throw new Error(`A book with ISBN ${isbn} already exists.`);
}


export interface BooksQuery {
  search: string;
  categoryId: string;
  status: string;
  page: number;
  pageSize: number;
}

export async function fetchBooks({ search, categoryId, status, page, pageSize }: BooksQuery) {
  let query = supabase
    .from("books")
    .select(sel(BOOK_SELECT), { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`title.ilike.${term},author.ilike.${term},isbn.ilike.${term}`);
  }
  if (categoryId && categoryId !== "all") query = query.eq("category_id", categoryId);
  if (status && status !== "all") query = query.eq("status", status as BookStatus);

  const { data, error, count } = await query.returns<BookRow[]>();
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

export async function fetchAllBooksLight() {
  const { data, error } = await supabase
    .from("books")
    .select(sel("id,title,purchase_cost,selling_price,status,inventory(quantity,minimum_stock_level)"))
    .returns<
      {
        id: string;
        title: string;
        purchase_cost: number;
        selling_price: number;
        status: BookStatus;
        inventory: { quantity: number; minimum_stock_level: number } | null;
      }[]
    >();
  if (error) throw error;
  return data ?? [];
}

export async function fetchRefTable(table: "categories" | "suppliers") {
  const { data, error } = await supabase
    .from(table)
    .select(sel("id,name"))
    .order("name")
    .returns<RefRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function logAudit(
  action: string,
  entityId: string | null,
  entityLabel: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("audit_logs").insert({
    user_id: data.user.id,
    action,
    entity_type: "book",
    entity_id: entityId,
    entity_label: entityLabel,
    metadata: metadata as never,
  });
}

export async function fetchAuditLogs(limit = 8) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select(sel("id,action,entity_type,entity_label,created_at,user_id"))
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<AuditRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function createBook(values: BookFormValues) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Your session expired. Please sign in again.");
  await assertIsbnAvailable(nullable(values.isbn));
  const { data, error } = await supabase
    .from("books")
    .insert({
      title: values.title,
      author: values.author,
      isbn: nullable(values.isbn),
      barcode: nullable(values.barcode),
      cover_url: nullable(values.cover_url),
      category_id: nullable(values.category_id),
      supplier_id: nullable(values.supplier_id),
      purchase_cost: values.purchase_cost,
      selling_price: values.selling_price,
      status: values.status,
      created_by: userData.user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(friendlyDbError(error));

  const { error: invError } = await supabase.from("inventory").insert({
    book_id: data.id,
    quantity: values.quantity,
    minimum_stock_level: values.minimum_stock_level,
    shelf_location: nullable(values.shelf_location),
  });
  if (invError) throw new Error(friendlyDbError(invError));

  await logAudit("Book Added", data.id, values.title, { quantity: values.quantity });
  return data.id;
}

export async function updateBook(book: BookRow, values: BookFormValues) {
  await assertIsbnAvailable(nullable(values.isbn), book.id);
  const { error } = await supabase
    .from("books")
    .update({
      title: values.title,
      author: values.author,
      isbn: nullable(values.isbn),
      barcode: nullable(values.barcode),
      cover_url: nullable(values.cover_url),
      category_id: nullable(values.category_id),
      supplier_id: nullable(values.supplier_id),
      purchase_cost: values.purchase_cost,
      selling_price: values.selling_price,
      status: values.status,
    })
    .eq("id", book.id);
  if (error) throw new Error(friendlyDbError(error));

  const inventoryPayload = {
    book_id: book.id,
    quantity: values.quantity,
    minimum_stock_level: values.minimum_stock_level,
    shelf_location: nullable(values.shelf_location),
  };
  const { error: invError } = book.inventory
    ? await supabase.from("inventory").update(inventoryPayload).eq("book_id", book.id)
    : await supabase.from("inventory").insert(inventoryPayload);
  if (invError) throw new Error(friendlyDbError(invError));

  await logAudit("Book Updated", book.id, values.title, {
    quantity: values.quantity,
    previous_quantity: book.inventory?.quantity ?? 0,
  });
}

export async function archiveBook(book: BookRow) {
  const { error } = await supabase.from("books").update({ status: "archived" }).eq("id", book.id);
  if (error) throw new Error(friendlyDbError(error));
  await logAudit("Book Archived", book.id, book.title);
}

export async function deleteBook(book: BookRow) {
  const { error } = await supabase.from("books").delete().eq("id", book.id);
  if (error) throw new Error(friendlyDbError(error));
  await logAudit("Book Deleted", book.id, book.title);

}

const COVER_BUCKET = "book-covers";

function coverObjectPath(path: string) {
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.replace(/^\/+/, "").replace(/^book-covers\//, "");
}

/** Public storefront URL. Works as soon as the book-covers bucket is public. */
export function publicCoverUrl(path: string | null) {
  if (!path) return null;
  const cleaned = coverObjectPath(path);
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(cleaned);
  return data.publicUrl;
}

export async function uploadCover(file: File) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export async function signedCoverUrl(path: string | null) {
  if (!path) return null;
  const cleaned = coverObjectPath(path);
  if (/^https?:\/\//i.test(cleaned)) return cleaned;

  const publicUrl = publicCoverUrl(cleaned);
  const { data, error } = await supabase.storage.from(COVER_BUCKET).createSignedUrl(cleaned, 60 * 60 * 24);
  if (!error && data?.signedUrl) return data.signedUrl;
  return publicUrl;
}

export const currency = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "symbol",
    minimumFractionDigits: 2,
  }).format(value || 0);
