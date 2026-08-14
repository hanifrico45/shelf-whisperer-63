// src/lib/guestCart.ts
import { supabase } from "@/integrations/supabase/client";
import { addToCart as addToCartServer } from "@/lib/shop";

export type GuestCartItem = { book_id: string; quantity: number };

const KEY = "bookshelf_guest_cart_v1";

export function readGuestCart(): GuestCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GuestCartItem[];
  } catch {
    return [];
  }
}

export function writeGuestCart(items: GuestCartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
  try {
    window.dispatchEvent(new CustomEvent("guest-cart-changed"));
  } catch {}
}

export function clearGuestCart() {
  writeGuestCart([]);
}

export function getGuestCartCount() {
  return readGuestCart().reduce((s, it) => s + (it.quantity || 0), 0);
}

export function addGuestCartItem(book_id: string, quantity = 1) {
  const items = readGuestCart();
  const idx = items.findIndex((i) => i.book_id === book_id);
  if (idx >= 0) {
    items[idx].quantity = (items[idx].quantity || 0) + quantity;
  } else {
    items.push({ book_id, quantity });
  }
  writeGuestCart(items);
}

export function updateGuestCartItem(book_id: string, quantity: number) {
  let items = readGuestCart();
  if (quantity <= 0) {
    items = items.filter((i) => i.book_id !== book_id);
  } else {
    const idx = items.findIndex((i) => i.book_id === book_id);
    if (idx >= 0) items[idx].quantity = quantity;
    else items.push({ book_id, quantity });
  }
  writeGuestCart(items);
}

export function removeGuestCartItem(book_id: string) {
  const items = readGuestCart().filter((i) => i.book_id !== book_id);
  writeGuestCart(items);
}

export async function addToCartClient(bookId: string, quantity = 1) {
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    await addToCartServer(bookId, quantity);
    return { server: true };
  } else {
    addGuestCartItem(bookId, quantity);
    return { server: false };
  }
}

export async function mergeGuestCartIntoUser() {
  const items = readGuestCart();
  if (!items || items.length === 0) return { merged: 0 };

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { merged: 0 };

  const bookIds = items.map((i) => i.book_id);
  const { data: invData, error: invErr } = await supabase
    .from("inventory")
    .select("book_id,quantity")
    .in("book_id", bookIds);
  if (invErr) throw invErr;

  const { data: existing, error: existingErr } = await supabase
    .from("cart_items")
    .select("id,book_id,quantity")
    .eq("user_id", auth.user.id)
    .in("book_id", bookIds);
  if (existingErr) throw existingErr;

  let mergedCount = 0;

  for (const g of items) {
    const stockRow = invData?.find((r: any) => r.book_id === g.book_id);
    const stock = stockRow ? Number(stockRow.quantity ?? 0) : null;
    const existingRow = existing?.find((r: any) => r.book_id === g.book_id);

    let targetQty = g.quantity;
    if (existingRow) targetQty = existingRow.quantity + g.quantity;
    if (stock !== null) targetQty = Math.min(targetQty, stock);

    if (existingRow) {
      const { error: upErr } = await supabase
        .from("cart_items")
        .update({ quantity: targetQty })
        .eq("id", existingRow.id);
      if (upErr) throw upErr;
      mergedCount++;
    } else {
      const { error: insErr } = await supabase.from("cart_items").insert({
        user_id: auth.user.id,
        book_id: g.book_id,
        quantity: targetQty,
      });
      if (insErr) throw insErr;
      mergedCount++;
    }
  }

  clearGuestCart();
  return { merged: mergedCount };
}
