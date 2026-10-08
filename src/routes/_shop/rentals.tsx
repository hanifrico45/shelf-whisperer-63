/* Rental tables are introduced in the migration; Supabase's generated types are refreshed after deployment. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ShopShell } from "@/components/shop/ShopShell";
import { CoverImage } from "@/components/books/CoverImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/auth";
import { rentalErrorMessage } from "@/lib/rental-errors";
import { RENTAL_MEMBERSHIP_WHATSAPP_URL } from "@/lib/rental-membership";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const db = supabase as any;
const money = (n: number) => `₦${n.toLocaleString("en-NG")}`;
export const Route = createFileRoute("/_shop/rentals")({
  ssr: false,
  head: () => ({ meta: [{ title: "Book Rental Service — Mindthrills Resources" }] }),
  component: RentalsPage,
});

function RentalsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [membershipRequestType, setMembershipRequestType] = useState<"single" | "family" | null>(
    null,
  );
  const user = useQuery({ queryKey: ["current-user"], queryFn: getCurrentUser });
  const userId = user.data?.id ?? "";
  const books = useQuery({
    queryKey: ["rental-catalog"],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_rental_catalog");
      if (error) throw error;
      return data ?? [];
    },
  });
  const membership = useQuery({
    queryKey: ["my-rental-membership"],
    enabled: !!user.data,
    queryFn: async () => {
      const { data, error } = await db
        .from("rental_memberships")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const enroll = useMutation({
    mutationFn: async (type: "single" | "family") => {
      const { error } = await db.rpc("request_rental_membership", { _type: type });
      if (error) throw error;
      return type;
    },
    onSuccess: (type) => {
      setMembershipRequestType(type);
      toast.success("Membership request saved as pending. Contact the store to arrange payment.");
      client.invalidateQueries({ queryKey: ["my-rental-membership"] });
    },
    onError: (e: Error) => toast.error(rentalErrorMessage(e)),
  });
  const reserve = useMutation({
    mutationFn: async (bookId: string) => {
      const { error } = await db.rpc("request_book_reservation", { _book_id: bookId });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Reservation request recorded."),
    onError: (e: Error) => toast.error(e.message),
  });
  const closeMembership = useMutation({
    mutationFn: async (membershipId: string) => {
      const { data, error } = await db.rpc("request_rental_membership_closure", {
        _membership_id: membershipId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (refund: number) => {
      toast.success(
        refund
          ? `Membership closed. ₦${refund.toLocaleString("en-NG")} deposit refund is pending.`
          : "Membership closed.",
      );
      client.invalidateQueries({ queryKey: ["my-rental-membership"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreDeposit = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await db.rpc("request_deposit_replenishment", {
        _membership_id: membershipId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deposit top-up request recorded. Contact the store to complete payment.");
      client.invalidateQueries({ queryKey: ["my-rental-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rentals = useQuery({
    queryKey: ["my-rentals"],
    enabled: !!user.data,
    queryFn: async () => {
      const { data, error } = await db
        .from("rentals")
        .select("*,books(title,author,cover_url),rental_payments(id,payment_type,amount,status)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const payments = useQuery({
    queryKey: ["my-rental-payments"],
    enabled: !!user.data,
    queryFn: async () => {
      const { data, error } = await db
        .from("rental_payments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const conditionReports = useQuery({
    queryKey: ["my-rental-condition-reports"],
    enabled: !!user.data,
    queryFn: async () => {
      const { data, error } = await db
        .from("rental_condition_reports")
        .select("*")
        .eq("user_id", userId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const visibleBooks = useMemo(
    () =>
      (books.data ?? []).filter((b: any) =>
        `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [books.data, search],
  );
  const m = membership.data;
  const membershipExpired = !!m?.expires_at && new Date(m.expires_at) <= new Date();

  return (
    <ShopShell>
      <section className="rounded-2xl bg-gradient-brand px-6 py-8 text-primary-foreground sm:px-9 sm:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
          Mindthrills Resources
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">
          Book Rental Service
        </h1>
        <p className="mt-2 max-w-2xl text-sm opacity-90">
          Become a member, borrow a good book, and return it for the next reader.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">14 days</Badge>
          <Badge variant="secondary">One 7-day renewal</Badge>
          <Badge variant="secondary">2 books at a time</Badge>
          <Badge variant="secondary">₦100/day late fee · max ₦500</Badge>
        </div>
      </section>
      <div className="mt-5 flex justify-end">
        <Button variant="outline" asChild>
          <Link to="/rental-policy">View Rental Policy</Link>
        </Button>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {(
          [
            ["single", "Single Package", 3000, "One individual reader"],
            ["family", "Family Package", 7000, "Parents and children in one household"],
          ] as const
        ).map(([type, title, fee, detail]) => (
          <article key={type} className="card-elevated flex flex-col p-5">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
            <p className="mt-4 text-2xl font-semibold">
              {money(fee)}
              <span className="text-sm font-normal text-muted-foreground"> / year</span>
            </p>
            <p className="mt-2 text-sm">
              Plus a separate refundable <strong>₦5,000 security deposit</strong>.
            </p>
            {m ? (
              <>
                <p className="mt-4 text-sm">
                  <Badge
                    variant={m.status === "active" && !membershipExpired ? "default" : "secondary"}
                  >
                    {membershipExpired ? "expired" : m.status}
                  </Badge>{" "}
                  {m.membership_type} ·{" "}
                  {m.expires_at
                    ? `expires ${new Date(m.expires_at).toLocaleDateString()}`
                    : "Awaiting store activation"}
                  <br />
                  Deposit balance: {money(Number(m.deposit_balance))}
                  {m.refund_status
                    ? ` · Refund ${m.refund_status}${m.refund_amount ? ` ${money(Number(m.refund_amount))}` : ""}`
                    : ""}
                </p>
                {(m.status === "expired" || membershipExpired) && (
                  <Button
                    className="mt-3 mr-2 self-start"
                    size="sm"
                    disabled={enroll.isPending}
                    onClick={() => enroll.mutate(type)}
                  >
                    Renew Membership
                  </Button>
                )}
                {m.status === "active" &&
                  !membershipExpired &&
                  Number(m.deposit_balance) < Number(m.deposit_required) && (
                    <Button
                      className="mt-3 mr-2 self-start"
                      size="sm"
                      variant="outline"
                      disabled={restoreDeposit.isPending}
                      onClick={() => restoreDeposit.mutate(m.id)}
                    >
                      Pay Security Deposit ·{" "}
                      {money(Number(m.deposit_required) - Number(m.deposit_balance))}
                    </Button>
                  )}
                {["active", "expired", "suspended"].includes(m.status) && (
                  <Button
                    className="mt-3 self-start"
                    variant="outline"
                    size="sm"
                    disabled={closeMembership.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Close this membership? Books and outstanding charges must be settled first.",
                        )
                      )
                        closeMembership.mutate(m.id);
                    }}
                  >
                    Close Membership
                  </Button>
                )}
              </>
            ) : user.data ? (
              <Button
                className="mt-4"
                disabled={enroll.isPending}
                onClick={() => enroll.mutate(type)}
              >
                Join {title}
              </Button>
            ) : (
              <Button className="mt-4" asChild>
                <Link to="/auth" search={{ mode: "login", next: "/rentals" }}>
                  Sign in to join
                </Link>
              </Button>
            )}
          </article>
        ))}
      </section>
      {m?.status === "pending" && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
          <ShieldCheck className="mr-2 inline size-4" />
          Your membership and deposit are awaiting manual payment confirmation by the store. Book
          rentals require an active membership.
          <div className="mt-3">
            <Button asChild size="sm">
              <a href={RENTAL_MEMBERSHIP_WHATSAPP_URL} target="_blank" rel="noreferrer">
                Contact Us on WhatsApp
              </a>
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={membershipRequestType !== null}
        onOpenChange={(open) => {
          if (!open) setMembershipRequestType(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arrange membership payment</DialogTitle>
            <DialogDescription>
              To activate your rental membership, please contact Mindthrills Resources on WhatsApp
              to arrange payment. Your membership will be activated by our admin after payment has
              been confirmed.
            </DialogDescription>
          </DialogHeader>
          {membershipRequestType && (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <p className="font-medium">
                  {membershipRequestType === "single" ? "Single Package" : "Family Package"}
                </p>
                <p className="text-lg font-semibold">
                  {money(membershipRequestType === "single" ? 3000 : 7000)} / year
                </p>
                <p className="text-sm text-muted-foreground">
                  Plus a separate refundable {money(5000)} security deposit.
                </p>
              </div>
              <Button asChild className="w-full">
                <a href={RENTAL_MEMBERSHIP_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  Contact Us on WhatsApp
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <section className="mt-10">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-display text-2xl font-semibold">Rentable books</h2>
            <p className="text-sm text-muted-foreground">
              Rental prices are separate from the book's selling price.
            </p>
          </div>
          <div className="relative sm:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or author"
              className="pl-9"
            />
          </div>
        </div>
        {books.isLoading ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : books.error ? (
          <p className="mt-5 rounded-xl border p-5 text-sm text-destructive">
            Could not load the rental catalog: {books.error.message}
          </p>
        ) : visibleBooks.length === 0 ? (
          <p className="mt-5 rounded-xl border p-8 text-center text-sm text-muted-foreground">
            No rentable books match your search.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleBooks.map((book: any) => (
              <article key={book.id} className="card-elevated flex gap-4 p-4">
                <CoverImage path={book.cover_url} alt={book.title} className="h-36 w-24 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h3 className="font-semibold leading-snug">{book.title}</h3>
                  <p className="text-sm text-muted-foreground">{book.author}</p>
                  <p className="mt-3 text-xs">Selling value: {money(Number(book.selling_price))}</p>
                  <p className="text-sm font-semibold">
                    Rent {money(Number(book.rental_fee))}{" "}
                    <span className="font-normal text-muted-foreground">
                      · Category {book.rental_category}
                    </span>
                  </p>
                  <div className="mt-2">
                    {book.available ? (
                      <Badge>Available</Badge>
                    ) : (
                      <Badge variant="secondary">Currently rented</Badge>
                    )}{" "}
                    {!book.available && book.due_at && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Expected back {new Date(book.due_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    {book.available ? (
                      <Button size="sm" asChild>
                        <Link to="/shop/$bookId" params={{ bookId: book.id }}>
                          View book and rent
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!user.data || reserve.isPending || m?.status !== "active"}
                        onClick={() => reserve.mutate(book.id)}
                      >
                        Request Reservation
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {!!user.data && (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-semibold">My Rentals</h2>
          {rentals.isLoading ? (
            <Skeleton className="mt-4 h-24" />
          ) : rentals.error ? (
            <p className="mt-3 text-sm text-destructive">
              Could not load your rentals: {rentals.error.message}
            </p>
          ) : (rentals.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Your rental history will appear here.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {rentals.data.map((r: any) => {
                const report = (conditionReports.data ?? []).find((x: any) => x.rental_id === r.id);
                return (
                  <article
                    key={r.id}
                    className="card-elevated flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div>
                      <p className="font-semibold">{r.books?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.checked_out_at
                          ? `Borrowed ${new Date(r.checked_out_at).toLocaleDateString()}`
                          : "Request awaiting store checkout"}
                        {r.due_at ? ` · Due ${new Date(r.due_at).toLocaleDateString()}` : ""}
                      </p>
                      <p className="text-xs">
                        Fee {money(Number(r.rental_fee))} · Renewal{" "}
                        {r.renewed_at
                          ? "used"
                          : r.renewal_requested_at
                            ? "payment pending"
                            : "available"}
                      </p>
                      <p className="text-xs">
                        Outstanding late fee: {money(Number(r.late_fee_paid ? 0 : r.late_fee))} ·
                        Other balance: {money(Number(r.balance_owed))}
                      </p>
                      {report && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Your condition report ({report.condition}): {report.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          r.status === "active"
                            ? r.due_at && new Date(r.due_at) < new Date()
                              ? "destructive"
                              : "default"
                            : "secondary"
                        }
                      >
                        {r.status === "active" && r.due_at && new Date(r.due_at) < new Date()
                          ? "Overdue"
                          : r.status}
                      </Badge>
                      {!report && ["active", "requested"].includes(r.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const condition = window.prompt(
                              "Book condition: good, fair, or damaged",
                              "good",
                            );
                            if (!condition) return;
                            const notes = window.prompt(
                              "Describe any existing damage (up to 1,000 characters)",
                            );
                            if (!notes) return;
                            try {
                              const { error } = await db.rpc("report_rental_condition", {
                                _rental_id: r.id,
                                _condition: condition,
                                _notes: notes,
                              });
                              if (error) throw error;
                              toast.success("Condition report saved");
                              client.invalidateQueries({
                                queryKey: ["my-rental-condition-reports"],
                              });
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          Report condition
                        </Button>
                      )}
                      {r.status === "active" && !r.renewed_at && !r.renewal_requested_at && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const { error } = await db.rpc("renew_book_rental", {
                                _rental_id: r.id,
                              });
                              if (error) throw error;
                              toast.success(
                                "Renewal requested; fee payment confirmation is pending.",
                              );
                              client.invalidateQueries({ queryKey: ["my-rentals"] });
                              client.invalidateQueries({ queryKey: ["my-rental-payments"] });
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          <CalendarDays className="mr-1 size-4" />
                          Renew
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {!!user.data && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">My Rental Payments</h2>
          <p className="text-sm text-muted-foreground">
            Membership, deposit, rental, renewal, late fees, and refunds are tracked separately.
            Pending manual payments need store confirmation.
          </p>
          {payments.isLoading ? (
            <Skeleton className="mt-3 h-20" />
          ) : payments.error ? (
            <p className="mt-3 text-sm text-destructive">
              Could not load payments: {payments.error.message}
            </p>
          ) : (payments.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No rental payments yet.</p>
          ) : (
            <div className="mt-3 grid gap-2">
              {payments.data.map((p: any) => (
                <div
                  key={p.id}
                  className="card-elevated flex items-center justify-between gap-3 p-3"
                >
                  <span className="text-sm capitalize">
                    {p.payment_type.replaceAll("_", " ")} · {money(Number(p.amount))}
                  </span>
                  <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <Clock3 className="size-4" />
        Memberships and all fees are tracked separately. Rental checkout and manual payment
        confirmation are completed by store staff.
      </p>
    </ShopShell>
  );
}
