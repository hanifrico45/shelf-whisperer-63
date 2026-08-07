import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = "cash" | "card" | "transfer";
export type SaleStatus = "completed" | "refunded" | "void";

export interface PosBook {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  barcode: string | null;
  cover_url: string | null;
  selling_price: number;
  status: string;
  inventory: { quantity: number } | null;
}

export interface CartLine {
  book_id: string;
  title: string;
  author: string;
  unit_price: number;
  quantity: number;
  stock: number;
  cover_url: string | null;
}

export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface SaleRow {
  id: string;
  sale_number: string;
  customer_name: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  change_due: number;
  status: SaleStatus;
  created_at: string;
  cashier_id: string | null;
  sale_items: {
    id: string;
    title: string;
    author: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
  }[];
  transactions: { id: string; method: PaymentMethod; amount: number; reference: string | null }[];
  receipts: { id: string; receipt_number: string; print_count: number }[];
}

const SALE_SELECT =
  "id,sale_number,customer_name,subtotal,discount_amount,tax_amount,total,amount_paid,change_due,status,created_at,cashier_id," +
  "sale_items(id,title,author,unit_price,quantity,line_total)," +
  "transactions(id,method,amount,reference)," +
  "receipts(id,receipt_number,print_count)";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Transfer",
};

export async function searchPosBooks(term: string) {
  let query = supabase
    .from("books")
    .select("id,title,author,isbn,barcode,cover_url,selling_price,status,inventory(quantity)")
    .neq("status", "archived")
    .order("title")
    .limit(24);

  const clean = term.trim();
  if (clean) {
    const like = `%${clean}%`;
    query = query.or(
      `title.ilike.${like},author.ilike.${like},isbn.ilike.${like},barcode.ilike.${like}`,
    );
  }

  const { data, error } = await query.returns<PosBook[]>();
  if (error) throw error;
  return data ?? [];
}

export async function findByCode(code: string) {
  const clean = code.trim();
  if (!clean) return null;
  const { data, error } = await supabase
    .from("books")
    .select("id,title,author,isbn,barcode,cover_url,selling_price,status,inventory(quantity)")
    .or(`barcode.eq.${clean},isbn.eq.${clean}`)
    .limit(1)
    .returns<PosBook[]>();
  if (error) throw error;
  return data?.[0] ?? null;
}

export interface CheckoutInput {
  items: { book_id: string; quantity: number }[];
  customerName: string;
  discountType: "amount" | "percent";
  discountValue: number;
  taxRate: number;
  payments: PaymentLine[];
  notes: string;
}

export interface CheckoutResult {
  sale_id: string;
  sale_number: string;
  receipt_number: string;
  total: number;
}

export async function checkoutSale(input: CheckoutInput) {
  const { data, error } = await supabase.rpc("checkout_sale", {
    _items: input.items as never,
    _customer_name: input.customerName,
    _discount_type: input.discountType,
    _discount_value: input.discountValue,
    _tax_rate: input.taxRate,
    _payments: input.payments as never,
    _notes: input.notes,
  });
  if (error) throw error;
  return data as unknown as CheckoutResult;
}

export async function fetchSales(search: string, page: number, pageSize: number) {
  let query = supabase
    .from("sales")
    .select(SALE_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  const clean = search.trim();
  if (clean) query = query.or(`sale_number.ilike.%${clean}%,customer_name.ilike.%${clean}%`);

  const { data, error, count } = await query.returns<SaleRow[]>();
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
}

export interface SalesSummary {
  today: { total: number; count: number };
  week: { total: number; count: number };
  month: { total: number; count: number };
  year: { total: number; count: number };
}

/** Totals for this week (Mon-start), month and year, from completed sales. */
export async function fetchSalesSummary(): Promise<SalesSummary> {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = (now.getDay() + 6) % 7; // Monday = 0
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - weekday);

  const { data, error } = await supabase
    .from("sales")
    .select("total,created_at,status")
    .eq("status", "completed")
    .gte("created_at", startOfYear.toISOString())
    .returns<{ total: number; created_at: string }[]>();
  if (error) throw error;

  const empty = () => ({ total: 0, count: 0 });
  const summary: SalesSummary = {
    today: empty(),
    week: empty(),
    month: empty(),
    year: empty(),
  };
  for (const row of data ?? []) {
    const at = new Date(row.created_at);
    const amount = Number(row.total) || 0;
    const add = (bucket: { total: number; count: number }) => {
      bucket.total += amount;
      bucket.count += 1;
    };
    add(summary.year);
    if (at >= startOfMonth) add(summary.month);
    if (at >= startOfWeek) add(summary.week);
    if (at >= startOfDay) add(summary.today);
  }
  return summary;
}

export async function fetchSale(saleId: string) {
  const { data, error } = await supabase
    .from("sales")
    .select(SALE_SELECT)
    .eq("id", saleId)
    .single<SaleRow>();
  if (error) throw error;
  return data;
}

export async function registerReprint(receiptId: string, current: number) {
  const { error } = await supabase
    .from("receipts")
    .update({ print_count: current + 1 })
    .eq("id", receiptId);
  if (error) throw error;
}

export function computeTotals(
  lines: CartLine[],
  discountType: "amount" | "percent",
  discountValue: number,
  taxRate: number,
) {
  const subtotal = lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const discountAmount =
    discountType === "percent"
      ? round2(subtotal * (discountValue / 100))
      : Math.min(discountValue || 0, subtotal);
  const taxAmount = round2((subtotal - discountAmount) * (taxRate / 100));
  const total = round2(subtotal - discountAmount + taxAmount);
  return { subtotal: round2(subtotal), discountAmount, taxAmount, total };
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
