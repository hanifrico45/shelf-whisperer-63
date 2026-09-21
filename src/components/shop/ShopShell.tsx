import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { BookOpen, LayoutDashboard, LogOut, Moon, ShoppingCart, Sun, User, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { getCurrentUser, logAuthEvent } from "@/lib/auth";
import { fetchCart, mergeGuestCart } from "@/lib/shop";
import { getGuestCartCount } from "@/lib/guest-cart";
import { fetchMyRoles, isStaffRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

export function ShopShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: getCurrentUser,
  });

  const rolesQuery = useQuery({
    queryKey: ["my-roles", userQuery.data?.id],
    enabled: !!userQuery.data,
    queryFn: fetchMyRoles,
  });

  const isAuthenticated = !!userQuery.data;
  const user = userQuery.data;
  const isAdmin = isStaffRole(rolesQuery.data ?? []);

  const cartQuery = useQuery({
    queryKey: ["cart"],
    queryFn: fetchCart,
  });

  const cartCount = isAuthenticated
    ? (cartQuery.data ?? []).reduce((sum, r) => sum + r.quantity, 0)
    : getGuestCartCount();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      queryClient.invalidateQueries({ queryKey: ["my-roles"] });
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  useEffect(() => {
    if (!user?.id) return;
    void mergeGuestCart().then((merged) => {
      if (merged) void queryClient.invalidateQueries({ queryKey: ["cart"] });
    });
  }, [queryClient, user?.id]);

  useEffect(() => {
    const channel = supabase
      .channel("storefront-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "cart_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["cart"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, () => {
        queryClient.invalidateQueries({ queryKey: ["shop-books"] });
        queryClient.invalidateQueries({ queryKey: ["shop-book"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "books" }, () => {
        queryClient.invalidateQueries({ queryKey: ["shop-books"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function handleSignOut() {
    await logAuthEvent("Logout");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/shop", replace: true });
  }

  const customerNav = [
    { to: "/shop", label: "Shop", icon: BookOpen },
    { to: "/orders", label: "Orders", icon: Package },
    { to: "/account", label: "Account", icon: User },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4">
          <Link to="/shop" className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-brand text-primary-foreground">
              <BookOpen className="size-5" />
            </span>
            <span className="font-display text-lg font-semibold">Bookshelf</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            <Link
              to="/shop"
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                pathname.startsWith("/shop") && "bg-secondary text-foreground",
              )}
            >
              Shop
            </Link>
            {isAuthenticated &&
              customerNav.slice(1).map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    pathname === item.to && "bg-secondary text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            <Button variant="ghost" size="icon" asChild aria-label="Cart">
              <Link to="/cart" className="relative">
                <ShoppingCart className="size-4" />
                {cartCount > 0 ? (
                  <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-[10px]">
                    {cartCount}
                  </Badge>
                ) : null}
              </Link>
            </Button>

            {!isAuthenticated && (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth" search={{ mode: "login" }}>
                    Sign in
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/auth" search={{ mode: "register" }}>
                    Sign up
                  </Link>
                </Button>
              </>
            )}

            {isAuthenticated && isAdmin && (
              <Button size="sm" asChild>
                <Link to="/dashboard">
                  <LayoutDashboard className="size-4" />
                  Admin Dashboard
                </Link>
              </Button>
            )}

            {isAuthenticated && (
              <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <nav className="flex items-center gap-1 border-t border-border px-4 py-2 sm:hidden">
          <Link
            to="/shop"
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground",
              pathname.startsWith("/shop") && "bg-secondary text-foreground",
            )}
          >
            <BookOpen className="size-3.5" />
            Shop
          </Link>
          {isAuthenticated &&
            customerNav.slice(1).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground",
                  pathname === item.to && "bg-secondary text-foreground",
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Bookshelf · Your neighbourhood bookstore, online.
      </footer>
    </div>
  );
}
