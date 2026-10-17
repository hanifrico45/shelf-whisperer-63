import { createFileRoute, Link } from "@tanstack/react-router";
import { ShopShell } from "@/components/shop/ShopShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_shop/rental-policy")({
  head: () => ({ meta: [{ title: "Rental Policy & Terms — Mindthrills Resources" }] }),
  component: PolicyPage,
});

const sections = [
  [
    "1. Membership",
    "A Single Package costs ₦5,000 per year for one individual reader. A Family Package costs ₦10,000 per year for parents and children in the same household. Membership lasts 12 months from registration/payment activation. Membership is required to borrow, and membership fees are separate from book rental fees: membership does not include free rentals. Membership fees are not refundable when a member voluntarily leaves early. Membership may be renewed after expiry.",
  ],
  [
    "2. Refundable Security Deposit",
    "A Single Package requires a ₦10,000 refundable security deposit; a Family Package requires ₦20,000. This is held during membership and is separate from membership and normal rental fees. It is not used to pay normal rental charges. After all books are returned and all rental, late, damage and other outstanding charges are settled, the remaining deposit is refundable on closure. Lost or seriously damaged books may require a deduction. If charges exceed the deposit, the remaining amount must be paid before closure. A reduced deposit must be restored to the package requirement before further borrowing.",
  ],
  [
    "3. Book Rental Categories & Fees",
    "Category A: selling value ₦10,000–₦12,000, rental fee ₦1,200. Category B: ₦6,000–₦9,999, rental fee ₦800. Category C: ₦3,000–₦5,999, rental fee ₦500. The applicable rental fee is paid each time a book is borrowed. Rental fees are separate from the selling price. Rental categories and fees are determined by the book's current selling value.",
  ],
  [
    "4. Borrowing Rules",
    "Single members may borrow a maximum of one book at a time. Family members may borrow up to three books at a time, one from each rental category A, B and C. At the package limit, members must return books before borrowing additional titles. High-demand and high-value books may be limited to one copy at a time. The standard borrowing period is 14 days. A book can be renewed once for an additional 7 days if requested before the due date, no other member has reserved it, and the applicable rental fee is paid. Renewal is never automatic. Books must be returned on or before the due date, in their general original condition, with all pages, covers and accompanying materials intact. An active membership and full security deposit are required.",
  ],
  [
    "5. Late Returns",
    "Late returns without an approved renewal incur ₦100 per book per day, capped at ₦500 per book. Late fees are separate from rental and renewal fees. Renewal must be requested before the original due date and cannot be approved when another member has reserved that book. Members cannot borrow again while a book is overdue or while applicable late fees are unpaid. Repeated late returns may result in temporary suspension.",
  ],
  [
    "6. Book Condition",
    "The store checks and records a book's general condition before issuing it. Members must report any existing damage BEFORE taking possession so it is not incorrectly attributed to them. Normal careful-reading wear is acceptable. Damage may include missing pages, badly torn pages, a missing cover, substantial writing, colouring or highlighting, liquid damage, severe stains, or damage making the book unsuitable for further rental.",
  ],
  [
    "7. Lost or Damaged Books",
    "Members are responsible for the current replacement cost of a lost book or one damaged beyond reasonable repair. The current selling price is normally used when the exact title is available. If unavailable, the store determines a reasonable amount based on recorded value and the availability of a suitable replacement. Security deposits of ₦10,000 (Single) or ₦20,000 (Family) may cover some or all loss/damage charges. For example, a ₦13,000 replacement against a ₦10,000 Single deposit leaves ₦3,000 to pay. If the amount owed is less than the deposit, only the required amount is deducted and the remaining deposit stays refundable, subject to clearance.",
  ],
  [
    "8. Membership Cancellation / Leaving the Service",
    "The member or store may initiate membership closure. Before closure, all books must be returned and rental, late, damage, and replacement charges settled. The remaining security deposit is then recorded for refund. The annual membership fee is not refundable when a member voluntarily leaves before the membership year ends. Rental history is retained.",
  ],
  [
    "9. Store Responsibilities",
    "The store records membership, deposits, rentals, due dates, returns, conditions, fees, and payment status. The store makes rental availability and applicable charges visible and processes returns and deposit refunds after obligations are settled.",
  ],
  [
    "10. Member Responsibilities",
    "Members must keep their account details current, pay applicable fees, take reasonable care of borrowed books, report existing or new damage promptly, return books by the due date, and settle eligible late, loss, or damage charges.",
  ],
  [
    "11. Copyright & Prohibited Use",
    "Borrowed books are for reading by the member or household covered by the membership. Do not reproduce, distribute, or commercially exploit copyrighted content without permission. Return the physical book to the store; rental does not transfer ownership.",
  ],
  [
    "12. Agreement",
    "Starting or continuing a rental membership or borrowing a book confirms that the member has read and agrees to this policy and the charges stated above.",
  ],
];

function PolicyPage() {
  return (
    <ShopShell>
      <div className="mx-auto max-w-3xl">
        <p className="text-sm font-semibold text-muted-foreground">
          Mindthrills Resources — Book Rental Service
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold">Rental Policy &amp; Terms</h1>
        <div className="mt-6 grid gap-4">
          {sections.map(([title, body]) => (
            <section key={title} className="card-elevated p-5">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
        <Button className="mt-6" asChild>
          <Link to="/rentals">Browse rentable books</Link>
        </Button>
      </div>
    </ShopShell>
  );
}
