import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // Redirect all visitors to the public shop
    throw redirect({ to: "/shop" });
  },
});
