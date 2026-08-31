/**
 * Guest cart storage using localStorage.
 * Format: { bookId: string, quantity: number }[]
 */

const GUEST_CART_KEY = "guest-cart";

export interface GuestCartItem {
  bookId: string;
  quantity: number;
}

/** Get guest cart from localStorage */
export function getGuestCart(): GuestCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(GUEST_CART_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/** Save guest cart to localStorage */
export function setGuestCart(items: GuestCartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn("[guest-cart] failed to save to localStorage", error);
  }
}

/** Add item to guest cart */
export function addToGuestCart(bookId: string, quantity: number = 1): void {
  const cart = getGuestCart();
  const existing = cart.find((item) => item.bookId === bookId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({ bookId, quantity });
  }
  setGuestCart(cart);
}

/** Remove item from guest cart */
export function removeFromGuestCart(bookId: string): void {
  const cart = getGuestCart();
  setGuestCart(cart.filter((item) => item.bookId !== bookId));
}

/** Update item quantity in guest cart */
export function updateGuestCartQuantity(bookId: string, quantity: number): void {
  const cart = getGuestCart();
  const item = cart.find((item) => item.bookId === bookId);
  if (item) {
    if (quantity <= 0) {
      removeFromGuestCart(bookId);
    } else {
      item.quantity = quantity;
      setGuestCart(cart);
    }
  }
}

/** Clear guest cart */
export function clearGuestCart(): void {
  setGuestCart([]);
}

/** Calculate total items in guest cart */
export function getGuestCartCount(): number {
  return getGuestCart().reduce((sum, item) => sum + item.quantity, 0);
}
