/* Rental tables are introduced in the migration; Supabase's generated types are refreshed after deployment. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;
export const Route = createFileRoute("/_authenticated/rental-management")({
  component: RentalManagementPage,
});

function RentalManagementPage() {
  const client = useQueryClient();
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const customers = useQuery({
    queryKey: ["admin-rental-customers"],
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roles, error: rolesError }] = await Promise.all([
        db.from("profiles").select("id,full_name,email,phone,created_at").order("created_at"),
        db.from("user_roles").select("user_id,role"),
      ]);
      if (error) throw error;
      if (rolesError) throw rolesError;
      const customerIds = new Set(
        (roles ?? [])
          .filter((role: any) => role.role === "customer")
          .map((role: any) => role.user_id),
      );
      return (profiles ?? []).filter((profile: any) => customerIds.has(profile.id));
    },
  });
  const memberships = useQuery({
    queryKey: ["admin-rental-memberships"],
    queryFn: async () => {
      const { data, error } = await db
        .from("rental_memberships")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((x: any) => x.user_id))];
      const { data: profiles, error: profilesError } = await db
        .from("profiles")
        .select("id,full_name,email,phone,created_at")
        .in("id", ids);
      if (profilesError) throw profilesError;
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((x: any) => ({ ...x, profile: byId.get(x.user_id) }));
    },
  });
  const rentals = useQuery({
    queryKey: ["admin-rentals"],
    queryFn: async () => {
      const { data, error } = await db
        .from("rentals")
        .select("*,books(title,author)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((x: any) => x.user_id))];
      const { data: profiles } = await db
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((x: any) => ({ ...x, profile: byId.get(x.user_id) }));
    },
  });
  const reservations = useQuery({
    queryKey: ["admin-rental-reservations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("rental_reservations")
        .select("*,books(title,author)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((x: any) => x.user_id))];
      const { data: profiles } = await db
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((x: any) => ({ ...x, profile: byId.get(x.user_id) }));
    },
  });
  const payments = useQuery({
    queryKey: ["admin-rental-payments"],
    queryFn: async () => {
      const { data, error } = await db
        .from("rental_payments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((x: any) => x.user_id))];
      const { data: profiles } = await db
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((x: any) => ({ ...x, profile: byId.get(x.user_id) }));
    },
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["admin-rental-memberships"] });
    client.invalidateQueries({ queryKey: ["admin-rentals"] });
    client.invalidateQueries({ queryKey: ["admin-rental-payments"] });
    client.invalidateQueries({ queryKey: ["admin-rental-reservations"] });
  };
  const action = useMutation({
    mutationFn: async ({ fn, args }: { fn: string; args: Record<string, unknown> }) => {
      const { error } = await db.rpc(fn, args);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rental record updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const recordPayment = useMutation({
    mutationFn: async (id: string) => {
      const method = window.prompt("Payment method: cash, transfer or manual", "transfer");
      if (!method) return;
      if (!["cash", "transfer", "manual"].includes(method.toLowerCase())) {
        throw new Error("Rental membership payments must be recorded as cash, transfer or manual.");
      }
      const normalizedMethod = method.toLowerCase();
      const reference = window.prompt("Payment reference (optional)");
      const { error } = await db.rpc("staff_record_rental_payment", {
        _payment_id: id,
        _method: normalizedMethod,
        _reference: reference || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const processReturn = async (r: any) => {
    const condition = window.prompt("Return condition: good, fair, damaged or lost", "good");
    if (!condition) return;
    let amount = 0;
    if (condition === "damaged" || condition === "lost") {
      const answer = window.prompt("Replacement / damage amount in Naira", "0");
      if (answer === null) return;
      amount = Number(answer);
      if (!Number.isFinite(amount) || amount < 0) {
        toast.error("Enter a valid amount");
        return;
      }
    }
    const notes = window.prompt("Condition notes (optional)") || null;
    action.mutate({
      fn: "process_rental_return",
      args: { _rental_id: r.id, _condition: condition, _notes: notes, _replacement_amount: amount },
    });
  };
  const activeMembers = (memberships.data ?? []).filter(
    (m: any) => m.status === "active" && m.expires_at && new Date(m.expires_at) > new Date(),
  ).length;
  const pendingMemberships = (memberships.data ?? []).filter(
    (m: any) => m.status === "pending",
  ).length;
  const inactiveMemberships = (memberships.data ?? []).filter(
    (m: any) =>
      ["expired", "closed", "suspended"].includes(m.status) ||
      (m.status === "active" && m.expires_at && new Date(m.expires_at) <= new Date()),
  ).length;
  const customerQuery = customerSearch.trim().toLowerCase();
  const matchesCustomerSearch = (customer: any) =>
    !customerQuery ||
    `${customer.full_name ?? ""} ${customer.email ?? ""} ${customer.phone ?? ""}`
      .toLowerCase()
      .includes(customerQuery);
  const visibleMemberships = (memberships.data ?? []).filter((m: any) => {
    const matchesSearch = matchesCustomerSearch({ ...m.profile, user_id: m.user_id });
    const isActive = m.status === "active" && m.expires_at && new Date(m.expires_at) > new Date();
    const matchesFilter =
      customerFilter === "all" ||
      customerFilter === "rental" ||
      (customerFilter === "pending" && m.status === "pending") ||
      (customerFilter === "active" && isActive) ||
      (customerFilter === "inactive" && !isActive && m.status !== "pending");
    return matchesSearch && matchesFilter;
  });
  const customersWithMembership = new Set((memberships.data ?? []).map((m: any) => m.user_id));
  const visibleNormalCustomers = (customers.data ?? []).filter(
    (customer: any) =>
      !customersWithMembership.has(customer.id) &&
      matchesCustomerSearch(customer) &&
      (customerFilter === "all" || customerFilter === "normal"),
  );
  const activeRentals = (rentals.data ?? []).filter((r: any) => r.status === "active");
  const overdue = activeRentals.filter((r: any) => r.due_at && new Date(r.due_at) < new Date());
  const lateOutstanding = (rentals.data ?? []).reduce(
    (s: number, r: any) => s + (r.late_fee_paid ? 0 : Number(r.late_fee)),
    0,
  );
  const heldDeposit = (memberships.data ?? []).reduce(
    (s: number, m: any) =>
      s + (["active", "suspended"].includes(m.status) ? Number(m.deposit_balance) : 0),
    0,
  );
  const damageOutstanding = (rentals.data ?? []).reduce(
    (s: number, r: any) => s + Number(r.balance_owed ?? 0),
    0,
  );
  return (
    <AppShell
      title="Rental Management"
      description="Memberships, payments, active loans and returns"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total customers", customers.data?.length ?? 0],
          ["Active members", activeMembers],
          ["Pending requests", pendingMemberships],
          ["Expired / inactive", inactiveMemberships],
          ["Active rentals", activeRentals.length],
          ["Overdue", overdue.length],
          ["Unpaid late fees", `₦${lateOutstanding.toLocaleString("en-NG")}`],
          ["Damage / loss owed", `₦${damageOutstanding.toLocaleString("en-NG")}`],
          ["Deposits held", `₦${heldDeposit.toLocaleString("en-NG")}`],
          [
            "Membership revenue",
            `₦${(payments.data ?? [])
              .filter((p: any) => p.status === "paid" && p.payment_type === "membership")
              .reduce((s: number, p: any) => s + Number(p.amount), 0)
              .toLocaleString("en-NG")}`,
          ],
          [
            "Rental revenue",
            `₦${(payments.data ?? [])
              .filter(
                (p: any) => p.status === "paid" && ["rental", "renewal"].includes(p.payment_type),
              )
              .reduce((s: number, p: any) => s + Number(p.amount), 0)
              .toLocaleString("en-NG")}`,
          ],
        ].map(([l, v]) => (
          <div key={String(l)} className="card-elevated p-4">
            <p className="text-sm text-muted-foreground">{l}</p>
            <p className="mt-1 text-2xl font-semibold">{v}</p>
          </div>
        ))}
      </div>
      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Customers &amp; memberships</h2>
            <p className="text-sm text-muted-foreground">
              Search customers and separate normal accounts, pending requests, rental members and
              inactive memberships.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_12rem]">
            <Input
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Search name, phone or email"
              aria-label="Search rental customers"
            />
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger aria-label="Filter customers">
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                <SelectItem value="normal">Normal customers</SelectItem>
                <SelectItem value="rental">Rental members</SelectItem>
                <SelectItem value="pending">Pending requests</SelectItem>
                <SelectItem value="active">Active members</SelectItem>
                <SelectItem value="inactive">Expired / inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 grid gap-3">
          {memberships.isLoading || customers.isLoading ? (
            <p>Loading memberships…</p>
          ) : memberships.error || customers.error ? (
            <p className="text-sm text-destructive">
              Could not load customer membership data:{" "}
              {memberships.error?.message ?? customers.error?.message}
            </p>
          ) : (
            <>
              {visibleNormalCustomers.map((customer: any) => (
                <article
                  key={customer.id}
                  className="card-elevated flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {customer.full_name || customer.email || customer.id}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {customer.phone || "No phone number"}
                      {customer.email ? ` · ${customer.email}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Customer since{" "}
                      {customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                  <Badge variant="outline">Normal customer</Badge>
                </article>
              ))}
              {visibleMemberships.map((m: any) => (
                <article
                  key={m.id}
                  className="card-elevated flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div>
                    <p className="font-semibold">
                      {m.profile?.full_name || m.profile?.email || m.user_id}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {m.profile?.phone || "No phone number"}
                      {m.profile?.email ? ` · ${m.profile.email}` : ""}
                    </p>
                    <p className="text-sm">
                      {m.membership_type} · ₦{Number(m.fee).toLocaleString("en-NG")}/year · Deposit
                      ₦{Number(m.deposit_balance).toLocaleString("en-NG")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested {new Date(m.created_at).toLocaleDateString()}
                      {m.starts_at
                        ? ` · Started ${new Date(m.starts_at).toLocaleDateString()}`
                        : ""}
                      {" · "}
                      {m.expires_at
                        ? `Expires ${new Date(m.expires_at).toLocaleDateString()}`
                        : "Not activated"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.status === "active" ? "default" : "secondary"}>
                      {m.status}
                    </Badge>
                    {m.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Confirm that the membership fee and the ₦5,000 refundable security deposit have both been received before activating this membership.",
                            )
                          )
                            return;
                          action.mutate({
                            fn: "staff_activate_rental_membership",
                            args: { _membership_id: m.id },
                          });
                        }}
                      >
                        Activate membership
                      </Button>
                    )}
                    {(m.status === "active" || m.status === "suspended") && (
                      <Select
                        value=""
                        onValueChange={async (v) => {
                          const { error } = await db.rpc("staff_set_rental_membership_status", {
                            _membership_id: m.id,
                            _status: v,
                          });
                          if (error) toast.error(error.message);
                          else {
                            toast.success(`Member ${v}`);
                            refresh();
                          }
                        }}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="Manage" />
                        </SelectTrigger>
                        <SelectContent>
                          {m.status === "active" ? (
                            <>
                              <SelectItem value="suspended">Suspend borrowing</SelectItem>
                              <SelectItem value="expired">Deactivate membership</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="active">Restore borrowing</SelectItem>
                              <SelectItem value="expired">Deactivate membership</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </article>
              ))}
              {visibleNormalCustomers.length === 0 && visibleMemberships.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No customers match this search or filter.
                </p>
              )}
            </>
          )}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Payments</h2>
        <p className="text-sm text-muted-foreground">
          Manual receipts are recorded separately by payment type.
        </p>
        <div className="mt-3 grid gap-2">
          {payments.isLoading ? (
            <p>Loading payments…</p>
          ) : payments.error ? (
            <p className="text-sm text-destructive">Could not load payments.</p>
          ) : (
            (payments.data ?? []).map((p: any) => (
              <article
                key={p.id}
                className="card-elevated flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="font-medium">
                    {p.profile?.full_name || p.profile?.email || p.user_id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.payment_type.replace("_", " ")} · ₦{Number(p.amount).toLocaleString("en-NG")}{" "}
                    · {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge>
                  {p.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => recordPayment.mutate(p.id)}
                      disabled={recordPayment.isPending}
                    >
                      Record payment / refund
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Reservations</h2>
        <div className="mt-3 grid gap-2">
          {reservations.isLoading ? (
            <p>Loading reservations…</p>
          ) : reservations.error ? (
            <p className="text-sm text-destructive">Could not load reservations.</p>
          ) : (reservations.data ?? []).filter((r: any) => r.status === "requested").length ===
            0 ? (
            <p className="text-sm text-muted-foreground">No requested reservations.</p>
          ) : (
            (reservations.data ?? [])
              .filter((r: any) => r.status === "requested")
              .map((r: any) => (
                <article
                  key={r.id}
                  className="card-elevated flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div>
                    <p className="font-medium">{r.books?.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.profile?.full_name || r.profile?.email || r.user_id} ·{" "}
                      {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const { error } = await db
                        .from("rental_reservations")
                        .update({ status: "fulfilled" })
                        .eq("id", r.id);
                      if (error) toast.error(error.message);
                      else {
                        toast.success("Reservation fulfilled");
                        refresh();
                      }
                    }}
                  >
                    Mark fulfilled
                  </Button>
                </article>
              ))
          )}
        </div>
      </section>
      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold">Rental history &amp; returns</h2>
        <div className="mt-3 grid gap-2">
          {rentals.isLoading ? (
            <p>Loading rentals…</p>
          ) : rentals.error ? (
            <p className="text-sm text-destructive">Could not load rentals.</p>
          ) : (
            (rentals.data ?? []).map((r: any) => (
              <article
                key={r.id}
                className="card-elevated flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="font-medium">
                    {r.books?.title}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {r.profile?.full_name || r.profile?.email || r.user_id}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.status} · Fee ₦{Number(r.rental_fee).toLocaleString("en-NG")}
                    {r.due_at ? ` · Due ${new Date(r.due_at).toLocaleDateString()}` : ""}
                    {r.returned_at
                      ? ` · Returned ${new Date(r.returned_at).toLocaleDateString()}`
                      : ""}
                  </p>
                  {r.preferred_date && (
                    <p className="text-xs text-muted-foreground">
                      Preferred {r.fulfillment_method === "delivery" ? "delivery" : "pickup"}:{" "}
                      {new Date(`${r.preferred_date}T12:00:00`).toLocaleDateString()}
                      {r.fulfillment_location ? ` · ${r.fulfillment_location}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      r.status === "active" && r.due_at && new Date(r.due_at) < new Date()
                        ? "destructive"
                        : r.status === "active"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {r.status === "active" && r.due_at && new Date(r.due_at) < new Date()
                      ? "overdue"
                      : r.status}
                  </Badge>
                  {r.status === "requested" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { error } = await db
                            .from("rentals")
                            .update({ status: "cancelled" })
                            .eq("id", r.id);
                          if (error) toast.error(error.message);
                          else {
                            toast.success("Request cancelled");
                            refresh();
                          }
                        }}
                      >
                        Cancel request
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          action.mutate({
                            fn: "staff_activate_book_rental",
                            args: { _rental_id: r.id, _condition: "good", _notes: null },
                          })
                        }
                      >
                        Issue book
                      </Button>
                    </>
                  )}
                  {r.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => processReturn(r)}>
                      Process return
                    </Button>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}
