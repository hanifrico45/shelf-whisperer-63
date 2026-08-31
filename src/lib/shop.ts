import { supabase } from "@/integrations/supabase/client";
import {
  getGuestCart,
  addToGuestCart,
  removeFromGuestCart,
  updateGuestCartQuantity,
  clearGuestCart,
} from "./guest-cart";

export interface ShopBook {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  description: string | null;
  cover_url: string | null;
  selling_price: number;
  status: string;
  category_id: string | null;
  categories: { id: string; name: string } | null;
  inventory: { quantity: number } | null;
}

const SHOP_SELECT =
  "id,title,author,isbn,description,cover_url,selling_price,status,category_id," +
  "categories(id,name),inventory(quantity)";

export async function fetchShopBooks(params: {
  search: string;
  categoryId: string;
  sort: "title" | "price_asc" | "price_desc";
  inStockOnly: boolean;
  page: number;
  pageSize: number;
}) {
  let query = supabase
    .from("books")
    .select(SHOP_SELECT, { count: "exact" })
    .eq("status", "active");

  const clean = params.search.trim();
  if (clean) {
    const like = `%${clean}%`;
    query = query.or(`title.ilike.${like},author.ilike.${like},isbn.ilike.${like}`);
  }
  if (params.categoryId && params.categoryId !== "all") {
    query = query.eq("category_id", params.categoryId);
  }
  if (params.sort === "title") query = query.order("title");
  else query = query.order("selling_price", { ascending: params.sort === "price_asc" });

  const from = params.page * params.pageSize;
  query = query.range(from, from + params.pageSize - 1);

  const { data, error, count } = await query.returns<ShopBook[]>();
  if (error) throw error;
  let rows = data ?? [];
  if (params.inStockOnly) rows = rows.filter((b) => (b.inventory?.quantity ?? 0) > 0);
  return { rows, count: count ?? 0 };
}

export async function fetchShopBook(id: string) {
  const { data, error } = await supabase
    .from("books")
    .select(SHOP_SELECT)
    .eq("id", id)
    .single<ShopBook>();
  if (error) throw error;
  return data;
}

export async function fetchShopCategories() {
  const { data, error } = await supabase.from("categories").select("id,name").order("name");
  if (error) throw error;
  return data ?? [];
}

export interface CartRow {
  id: string;
  quantity: number;
  book_id: string;
  books: {
    id: string;
    title: string;
    author: string;
    cover_url: string | null;
    selling_price: number;
    inventory: { quantity: number } | null;
  } | null;
}

/** Fetch cart for authenticated user or guest. Returns empty array if unauthorized. */
export async function fetchCart() {
  const { data: auth } = await supabase.auth.getUser();

  // Authenticated user: fetch from database
  if (auth.user) {
    const { data, error } = await supabase
      .from("cart_items")
      .select("id,quantity,book_id,books(id,title,author,cover_url,selling_price,inventory(quantity))")
      .eq("user_id", auth.user.id)
      .order("created_at")
      .returns<CartRow[]>();
    if (error) throw error;
    return data ?? [];
  }

  // Guest: fetch from localStorage and enrich with book data
  const guestItems = getGuestCart();
  if (guestItems.length === 0) return [];

  const { data: books, error } = await supabase
    .from("books")
    .select("id,title,author,cover_url,selling_price,inventory(quantity)")
    .in("id", guestItems.map(item => item.bookId))
    .returns<ShopBook[]>();

  if (error) throw error;

  // Map guest items to CartRow format
  return guestItems.map(item => {
    const book = books?.find(b => b.id === item.bookId);
    return {
      id: item.bookId, // Use bookId as id for guests
      quantity: item.quantity,
      book_id: item.bookId,
      books: book ? {
        id: book.id,
        title: book.title,
        author: book.author,
        cover_url: book.cover_url,
        selling_price: book.selling_price,
        inventory: book.inventory,
      } : null,
    } as CartRow;
  });
}

/** Add to cart for authenticated user or guest */
export async function addToCart(bookId: string, quantity = 1) {
  const { data: auth } = await supabase.auth.getUser();

  // Authenticated user
  if (auth.user) {
    const { data: existing } = await supabase
      .from("cart_items")
      .select("id,quantity")
      .eq("user_id", auth.user.id)
      .eq("book_id", bookId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("cart_items")
        .update({ quantity: existing.quantity + quantity })
        .eq("id", existing.id);
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from("cart_items")
      .insert({ user_id: auth.user.id, book_id: bookId, quantity });
    if (error) throw error;
    return;
  }

  // Guest: add to localStorage
  addToGuestCart(bookId, quantity);
}

/** Update cart item quantity - supports authenticated and guest carts */
export async function updateCartQuantity(cartItemId: string, quantity: number) {
  const { data: auth } = await supabase.auth.getUser();

  if (quantity <= 0) return removeCartItem(cartItemId);

  // Authenticated user
  if (auth.user) {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity })
      .eq("id", cartItemId);
    if (error) throw error;
    return;
  }

  // Guest: update in localStorage (cartItemId is actually bookId for guests)
  updateGuestCartQuantity(cartItemId, quantity);
}

/** Remove cart item - supports authenticated and guest carts */
export async function removeCartItem(cartItemId: string) {
  const { data: auth } = await supabase.auth.getUser();

  // Authenticated user
  if (auth.user) {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("id", cartItemId);
    if (error) throw error;
    return;
  }

  // Guest: remove from localStorage (cartItemId is actually bookId for guests)
  removeFromGuestCart(cartItemId);
}

/** Move a browser-only cart into the signed-in customer's cart after login. */
export async function mergeGuestCart(): Promise<boolean> {
  const guestItems = getGuestCart();
  if (guestItems.length === 0) return false;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;

  const { data: existing, error: existingError } = await supabase
    .from("cart_items")
    .select("book_id,quantity")
    .eq("user_id", auth.user.id);
  if (existingError) throw existingError;

  const existingQuantities = new Map(
    (existing ?? []).map((item) => [item.book_id, item.quantity]),
  );
  const rows = guestItems.map((item) => ({
    user_id: auth.user.id,
    book_id: item.bookId,
    quantity: (existingQuantities.get(item.bookId) ?? 0) + item.quantity,
  }));
  const { error } = await supabase
    .from("cart_items")
    .upsert(rows, { onConflict: "user_id,book_id" });
  if (error) throw error;

  clearGuestCart();
  return true;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
}

export async function fetchMyProfile(): Promise<ProfileRow | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,phone")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(input: { full_name: string; phone: string }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You must be signed in.");
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: input.full_name, phone: input.phone })
    .eq("id", auth.user.id);
  if (error) throw error;
}



export interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  shipping_address: string | null;
  contact_phone: string | null;
  created_at: string;
  sales: {
    sale_number: string;
    sale_items: { id: string; title: string; quantity: number; line_total: number }[];
  } | null;
}

export async function fetchMyOrders() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,order_number,status,subtotal,tax_amount,total,payment_method,shipping_address,contact_phone,created_at," +
        "sales(sale_number,sale_items(id,title,quantity,line_total))",
    )
    .eq("customer_id", auth.user.id)
    .order("created_at", { ascending: false })
    .returns<OrderRow[]>();
  if (error) throw error;
  return data ?? [];
}

export async function placeOrder(input: {
  paymentMethod: "cash" | "card" | "transfer";
  shippingAddress: string;
  contactPhone: string;
  taxRate?: number;
  notes?: string;
}) {
  const { data, error } = await supabase.rpc("place_customer_order", {
    _payment_method: input.paymentMethod,
    _shipping_address: input.shippingAddress,
    _contact_phone: input.contactPhone,
    _tax_rate: input.taxRate ?? 0,
    _notes: input.notes ?? "",
  });
  if (error) throw error;
  return data as unknown as {
    order_id: string;
    order_number: string;
    sale_number: string;
    total: number;
  };
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
