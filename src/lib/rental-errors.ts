const RENTAL_MIGRATION_MESSAGE =
  "Book rentals are not enabled in the connected database yet. Apply supabase/migrations/20261005120000_book_rentals.sql and supabase/migrations/20261005130000_book_rental_booking_details.sql, then retry.";

export function rentalErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String(error.message ?? "")
        : String(error ?? "");
  if (
    /schema cache|could not find the function/i.test(message) &&
    /request_rental_membership|rental_membership/i.test(message)
  ) {
    return RENTAL_MIGRATION_MESSAGE;
  }
  return message || "The rental request could not be completed. Please try again.";
}
