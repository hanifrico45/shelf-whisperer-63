import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { BookOpen, LogOut, Moon, ShoppingCart, Sun, User, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/auth";
import { fetchCart } from "@/lib/shop";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/shop", label: "Browse", icon: BookOpen },
  { to: "/orders", label: "Orders", icon: Package },
  { to: "/account", label: "Profile", icon: User },
] as const;

export function ShopShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const cartQuery = useQuery({ queryKey: ["cart"], queryFn: fetchCart });
  const cartCount = (cartQuery.data ?? []).reduce((sum, r) => sum + r.quantity, 0);

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
    navigate({ to: "/auth", replace: true });
  }

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
            {nav.map((item) => (
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
            <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>

        <nav className="flex items-center gap-1 border-t border-border px-4 py-2 sm:hidden">
          {nav.map((item) => (
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
