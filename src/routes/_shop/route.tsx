import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_shop")({
  ssr: false,
  // Browse and cart routes below this layout are deliberately public. Individual
  // customer-only pages enforce authentication in their own route guards.
  component: () => <Outlet />,
});
