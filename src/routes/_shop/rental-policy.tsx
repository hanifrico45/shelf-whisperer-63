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
    "A Single Package costs ₦3,000 per year for one reader. A Family Package costs ₦7,000 per year for parents and children in the same household. Membership lasts 12 months from activation. Membership is required to borrow. Membership fees are separate from rental fees and are not refundable when a member voluntarily leaves early. Membership may be renewed after expiry.",
  ],
  [
    "2. Refundable Security Deposit",
    "Members pay a separate ₦5,000 refundable security deposit held during membership. It is not used for ordinary rental charges. Eligible lost, damaged, or other outstanding charges may be applied to it. If it is reduced, it may need to be restored to ₦5,000 before further borrowing. At closure, the remaining balance is refundable after obligations are settled. The deposit does not limit responsibility for a book or charge.",
  ],
  [
    "3. Book Rental Categories & Fees",
    "Category A: selling value ₦10,000–₦12,000, rental fee ₦1,200. Category B: ₦6,000–₦9,999, rental fee ₦800. Category C: ₦3,000–₦5,999, rental fee ₦500. The applicable rental fee is paid each time a book is borrowed. Rental fees are separate from the selling price. Store staff may set an override where needed.",
  ],
  [
    "4. Borrowing Rules",
    "A member may borrow up to two books at a time. Some books may be restricted to one-at-a-time. The standard rental period is 14 days. A rental may be renewed once for seven additional days by request before its due date, if another member has not requested the book. The renewal fee is the applicable rental fee. Renewal is not automatic. Borrowing requires an active membership, valid deposit, available book, and no unresolved overdue rental.",
  ],
  [
    "5. Late Returns",
    "The late fee is ₦100 per book per day, capped at ₦500 per book. Late fees are separate from rental and renewal fees and must be settled before borrowing again. Return the overdue book and settle the fee before making another rental. Repeated late returns may result in temporary suspension.",
  ],
  [
    "6. Book Condition",
    "The store records a book's issue and return condition. Members should report existing damage before or immediately after receiving a book. Examples include missing pages or cover, badly torn pages, significant writing or colouring, liquid damage, severe stains, or damage that makes a book unsuitable for further rental. Normal signs of careful reading are not automatically damage.",
  ],
  [
    "7. Lost or Damaged Books",
    "A member is responsible for the current replacement cost of a lost book or one damaged beyond reasonable repair. If the same title is available for purchase, its current selling price is the normal replacement basis. If it is unavailable, the store determines a reasonable amount based on recorded value and suitable replacements. The deposit may be applied to the charge; any remaining amount is still owed.",
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
