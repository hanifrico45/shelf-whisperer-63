/* Rental RPCs are defined in the rental migrations; Supabase types are generated before deployment. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser } from "@/lib/auth";
import { rentalErrorMessage } from "@/lib/rental-errors";
import { RENTAL_MEMBERSHIP_WHATSAPP_URL } from "@/lib/rental-membership";
import type { ShopBook } from "@/lib/shop";

const db = supabase as any;

function dateInputValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function money(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}

export function BookRentalAction({ book }: { book: ShopBook }) {
  const queryClient = useQueryClient();
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [rentalOpen, setRentalOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "card">("transfer");
  const [createdRentalId, setCreatedRentalId] = useState<string | null>(null);
  const [membershipType, setMembershipType] = useState<"single" | "family">("single");
  const [membershipRequestType, setMembershipRequestType] = useState<"single" | "family" | null>(
    null,
  );
  const [pickupDate, setPickupDate] = useState(() =>
    dateInputValue(new Date(Date.now() + 86_400_000)),
  );
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"pickup" | "delivery">("pickup");
  const [location, setLocation] = useState("");

  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: getCurrentUser,
  });
  const userId = userQuery.data?.id;
  const memberQuery = useQuery({
    queryKey: ["my-rental-membership", userId],
    enabled: !!userId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("rental_memberships")
        .select(
          "id,membership_type,status,expires_at,deposit_balance,deposit_required,suspended_until",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const availabilityQuery = useQuery({
    queryKey: ["rental-catalog", "book-actions"],
    queryFn: async () => {
      const { data, error } = await db.rpc("get_rental_catalog");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10_000,
    retry: false,
  });
  const activeRentalsQuery = useQuery({
    queryKey: ["my-active-rental-count", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { count, error } = await db
        .from("rentals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["requested", "active"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const rentalBook = (availabilityQuery.data ?? []).find((row: any) => row.id === book.id);
  const member = memberQuery.data;
  const hasMembership =
    member?.status === "active" && (!member.expires_at || new Date(member.expires_at) > new Date());
  const isPending = member?.status === "pending";
  const hasBlockedMembership =
    member?.status === "suspended" || member?.status === "closure_pending";
  const isUnavailable = !book.rentable || !book.rental_fee || !rentalBook?.available;

  const membershipMutation = useMutation({
    mutationFn: async (type: "single" | "family") => {
      const { data, error } = await db.rpc("request_rental_membership", { _type: type });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, type) => {
      setMembershipRequestType(type);
      toast.success("Membership request saved as pending. Contact the store to arrange payment.");
      await queryClient.invalidateQueries({ queryKey: ["my-rental-membership"] });
    },
    onError: (error: Error) => toast.error(rentalErrorMessage(error)),
  });

  const rentalMutation = useMutation({
    mutationFn: async () => {
      const method = fulfillmentMethod;
      const place =
        method === "pickup" ? "Bookstore pickup (store will confirm address)" : location.trim();
      const { data, error } = await db.rpc("request_book_rental", {
        _book_id: book.id,
        _pickup_date: pickupDate,
        _fulfillment_method: method,
        _fulfillment_location: place,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (rentalId: string) => {
      setCreatedRentalId(rentalId);
      toast.success("Rental saved. Payment is awaiting store verification.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rental-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["my-rentals"] }),
        queryClient.invalidateQueries({ queryKey: ["my-active-rental-count"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "Could not request this rental"),
  });

  const contactUrl = createdRentalId
    ? "https://wa.me/2348184556437?text=" + encodeURIComponent(
        `Hello Mindthrills Resources, I requested to rent "${book.title}" (rental ID: ${createdRentalId}). Rental fee: ${money(Number(rentalBook?.rental_fee ?? book.rental_fee))}. Payment method: ${paymentMethod}. I selected ${fulfillmentMethod === "pickup" ? "bookstore pickup" : "delivery to " + location.trim()} on ${pickupDate}. I have indicated payment on the website; please verify the payment and confirm my pending rental.`
      )
    : "";
  const paymentClaim = useMutation({
    mutationFn: async () => {
      if (!createdRentalId) throw new Error("Create the rental request first.");
      const { error } = await db.rpc("customer_confirm_rental_payment_intent", {
        _rental_id: createdRentalId, _method: paymentMethod, _claims_paid: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment confirmation sent for verification. Continue on WhatsApp.");
      window.open(contactUrl, "_blank", "noopener,noreferrer");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (userQuery.isLoading || (userId && memberQuery.isLoading) || availabilityQuery.isLoading) {
    return (
      <Button size="sm" variant="outline" disabled>
        Checking rental availability…
      </Button>
    );
  }

  if (isUnavailable) {
    return (
      <div className="space-y-1">
        <Button
          size="sm"
          variant="outline"
          disabled
          aria-label={`${book.title} rental unavailable`}
        >
          Rental Unavailable
        </Button>
        {availabilityQuery.error && book.rentable && (
          <p className="text-xs text-destructive">
            Rental status could not be checked: {availabilityQuery.error.message}
          </p>
        )}
      </div>
    );
  }

  if (userId && memberQuery.error) {
    return (
      <div className="space-y-1">
        <Button size="sm" variant="outline" className="w-full" disabled>
          Rental Status Unavailable
        </Button>
        <p className="text-xs text-destructive">
          Membership status could not be checked: {memberQuery.error.message}
        </p>
      </div>
    );
  }

  return (
    <>
      {!userId ? (
        <Button size="sm" variant="outline" className="w-full" asChild>
          <Link to="/auth" search={{ mode: "login", next: `/shop/${book.id}` }}>
            Sign in to Rent
          </Link>
        </Button>
      ) : hasMembership ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => {
            if (activeRentalsQuery.error) {
              toast.error(
                `Could not check your active rentals: ${activeRentalsQuery.error.message}`,
              );
              return;
            }
            if ((activeRentalsQuery.data ?? 0) >= 2) {
              toast.error(
                "You already have 2 active rentals. Return a book before renting another.",
              );
              return;
            }
            setReviewing(false);
            setCreatedRentalId(null);
            setRentalOpen(true);
          }}
        >
          Rent
        </Button>
      ) : isPending ? (
        <div className="space-y-2">
          <Button size="sm" variant="outline" className="w-full" disabled>
            Membership Pending
          </Button>
          <Button size="sm" variant="link" className="w-full" asChild>
            <a href={RENTAL_MEMBERSHIP_WHATSAPP_URL} target="_blank" rel="noreferrer">
              Contact Us on WhatsApp
            </a>
          </Button>
        </div>
      ) : hasBlockedMembership ? (
        <Button size="sm" variant="outline" className="w-full" disabled>
          {member?.status === "suspended" ? "Membership Suspended" : "Membership Closure Pending"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => setMembershipOpen(true)}
        >
          Get Rental Membership
        </Button>
      )}

      <Dialog open={membershipOpen} onOpenChange={setMembershipOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {membershipRequestType ? "Arrange membership payment" : "Choose a rental membership"}
            </DialogTitle>
            <DialogDescription>
              {membershipRequestType
                ? "Your request is pending. To activate your membership, contact Mindthrills Resources on WhatsApp to arrange payment. An admin will activate it after payment is confirmed."
                : `Choose a package for ${book.title}. Payment is arranged manually with the store; membership is not activated until an admin confirms payment.`}
            </DialogDescription>
          </DialogHeader>
          {membershipRequestType ? (
            <div className="space-y-4 rounded-lg border p-4">
              <div>
                <p className="font-medium">
                  {membershipRequestType === "single" ? "Single Membership" : "Family Membership"}
                </p>
                <p className="text-lg font-semibold">
                  {money(membershipRequestType === "single" ? 5000 : 10000)} / year
                </p>
                <p className="text-sm text-muted-foreground">
                  Plus a separate {money(membershipRequestType === "single" ? 10000 : 20000)} refundable security deposit.
                </p>
              </div>
              <Button asChild className="w-full">
                <a href={RENTAL_MEMBERSHIP_WHATSAPP_URL} target="_blank" rel="noreferrer">
                  Contact Us on WhatsApp
                </a>
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setMembershipOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["single", "Single Membership", 5000],
                  ["family", "Family Membership", 10000],
                ] as const
              ).map(([type, title, fee]) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={membershipType === type}
                  onClick={() => setMembershipType(type)}
                  className={`rounded-lg border p-4 text-left ${membershipType === type ? "border-primary ring-1 ring-primary" : "border-border"}`}
                >
                  <span className="block font-medium">{title}</span>
                  <span className="mt-1 block text-lg font-semibold">{money(fee)} / year</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Plus a separate {money(type === "single" ? 10000 : 20000)} refundable deposit
                  </span>
                </button>
              ))}
            </div>
          )}
          {!membershipRequestType && (
            <DialogFooter>
              <Button
                disabled={membershipMutation.isPending}
                onClick={() => membershipMutation.mutate(membershipType)}
              >
                {membershipMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Request membership
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rentalOpen}
        onOpenChange={(open) => {
          setRentalOpen(open);
          if (!open) { setReviewing(false); setCreatedRentalId(null); }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{createdRentalId ? "Rental payment pending" : reviewing ? "Review and pay for your rental" : "Rent this book"}</DialogTitle>
            <DialogDescription>
              {createdRentalId
                ? "Your rental request is saved. Tell us when you have paid, then contact the store on WhatsApp for verification."
                : reviewing
                  ? "Confirm the rental fee, payment method and delivery or pickup details."
                  : "Choose a date and delivery or pickup, then select how you will arrange payment."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border p-4">
            <p className="font-medium">{book.title}</p>
            <p className="text-sm text-muted-foreground">{book.author}</p>
            <p className="mt-2 text-sm font-semibold">
              Rental fee: {money(Number(rentalBook?.rental_fee ?? book.rental_fee))} · Category {rentalBook?.rental_category ?? book.rental_category}
            </p>
            <p className="text-xs text-muted-foreground">Standard rental period: 14 days</p>
          </div>
          {createdRentalId ? (
            <div className="space-y-4 rounded-lg border p-4 text-sm">
              <p className="font-medium">Rental #{createdRentalId.slice(0, 8)} · {money(Number(rentalBook?.rental_fee ?? book.rental_fee))}</p>
              <p>Payment method: {paymentMethod === "transfer" ? "Bank transfer" : "Card (arranged with store)"}</p>
              <p className="text-muted-foreground">Your rental and payment remain pending until staff confirms payment. Card payments are arranged with the store; the website does not collect card details.</p>
              <Button className="w-full" disabled={paymentClaim.isPending} onClick={() => paymentClaim.mutate()}>
                {paymentClaim.isPending && <Loader2 className="size-4 animate-spin" />}
                I have paid — Contact WhatsApp
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href={contactUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> Contact WhatsApp to check pending rent</a>
              </Button>
            </div>
          ) : !reviewing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`rental-date-${book.id}`}>Preferred pickup / delivery date</Label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id={`rental-date-${book.id}`}
                    type="date"
                    min={dateInputValue(new Date())}
                    value={pickupDate}
                    onChange={(event) => setPickupDate(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`rental-method-${book.id}`}>Pickup or delivery</Label>
                <select
                  id={`rental-method-${book.id}`}
                  value={fulfillmentMethod}
                  onChange={(event) =>
                    setFulfillmentMethod(event.target.value as "pickup" | "delivery")
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="pickup">Pick up at the bookstore</option>
                  <option value="delivery">Deliver to an address</option>
                </select>
                {fulfillmentMethod === "pickup" ? (
                  <p className="text-xs text-muted-foreground">
                    The store will confirm the pickup address.
                  </p>
                ) : (
                  <Input
                    aria-label="Delivery address"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Enter delivery address"
                    maxLength={300}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="space-y-2">
                <Label htmlFor={`rental-payment-${book.id}`}>Pay rental fee by</Label>
                <select
                  id={`rental-payment-${book.id}`}
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as "transfer" | "card")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="transfer">Bank transfer</option>
                  <option value="card">Card — arrange payment with store</option>
                </select>
                <p className="text-xs text-muted-foreground">Payment is arranged directly with the bookstore; this website does not process cards. Staff verifies your payment before checkout.</p>
              </div>
              <p>
                <span className="text-muted-foreground">Preferred date:</span>{" "}
                {new Date(`${pickupDate}T12:00:00`).toLocaleDateString()}
              </p>
              <p>
                <span className="text-muted-foreground">Method:</span>{" "}
                {fulfillmentMethod === "pickup" ? "Bookstore pickup" : "Delivery"}
              </p>
              {fulfillmentMethod === "delivery" && (
                <p className="break-words">
                  <span className="text-muted-foreground">Address:</span> {location}
                </p>
              )}
            </div>
          )}
          {!createdRentalId && <DialogFooter>
            {reviewing ? (
              <>
                <Button variant="outline" onClick={() => setReviewing(false)}>
                  Edit details
                </Button>
                <Button disabled={rentalMutation.isPending} onClick={() => rentalMutation.mutate()}>
                  {rentalMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                  Confirm rental and continue to payment
                </Button>
              </>
            ) : (
              <Button
                disabled={
                  !pickupDate || (fulfillmentMethod === "delivery" && location.trim().length < 5)
                }
                onClick={() => setReviewing(true)}
              >
                Review rental
              </Button>
            )}
          </DialogFooter>}
        </DialogContent>
      </Dialog>
    </>
  );
}
