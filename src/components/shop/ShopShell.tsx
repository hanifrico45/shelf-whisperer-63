import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { BookOpen, LogOut, Moon, ShoppingCart, Sun, User, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { logAuthEvent } from "@/lib/auth";
import { fetchCart, mergeGuestCart } from "@/lib/shop";
import { getGuestCartCount } from "@/lib/guest-cart";
import { cn } from "@/lib/utils";

export function ShopShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Get current user
  const userQuery = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const isAuthenticated = !!userQuery.data;
  const user = userQuery.data;

  const cartQuery = useQuery({
    queryKey: ["cart"],
    queryFn: fetchCart,
  });

  // For guests, use localStorage cart count; for authenticated, use database
  const cartCount = isAuthenticated
    ? (cartQuery.data ?? []).reduce((sum, r) => sum + r.quantity, 0)
    : getGuestCartCount();

  // Subscribe to auth state changes
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  useEffect(() => {
    if (!user?.id) return;

    void mergeGuestCart().then((merged) => {
      if (merged) void queryClient.invalidateQueries({ queryKey: ["cart"] });
    });
  }, [queryClient, user?.id]);

  // Subscribe to cart changes
  useEffect(() => {
    if (!isAuthenticated) return;

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
  }, [queryClient, isAuthenticated]);

  async function handleSignOut() {
    await logAuthEvent("Logout");
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/shop", replace: true });
  }

  // Navigation items (shown only for authenticated users)
  const authNav = [
    { to: "/shop", label: "Browse", icon: BookOpen },
    { to: "/orders", label: "Orders", icon: Package },
    { to: "/account", label: "Profile", icon: User },
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

          {isAuthenticated && (
            <nav className="ml-4 hidden items-center gap-1 sm:flex">
              {authNav.map((item) => (
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
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            {/* Cart button - always available */}
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

            {/* Sign in/up buttons for guests */}
            {!isAuthenticated && (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/auth" search={{ mode: "register" }}>
                    Sign up
                  </Link>
                </Button>
              </>
            )}

            {/* Sign out button for authenticated users */}
            {isAuthenticated && (
              <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Mobile navigation - only for authenticated users */}
        {isAuthenticated && (
          <nav className="flex items-center gap-1 border-t border-border px-4 py-2 sm:hidden">
            {authNav.map((item) => (
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
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Bookshelf · Your neighbourhood bookstore, online.
      </footer>
    </div>
  );
}
