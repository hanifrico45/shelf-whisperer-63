import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ShopShell } from "@/components/shop/ShopShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMyProfile, updateMyProfile } from "@/lib/shop";

export const Route = createFileRoute("/_shop/account")({
  head: () => ({
    meta: [
      { title: "My profile — Bookshelf Store" },
      { name: "description", content: "Manage your Bookshelf customer profile and contact details." },
      { property: "og:title", content: "My profile — Bookshelf Store" },
      { property: "og:description", content: "Update your name and contact information." },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["my-profile"], queryFn: fetchMyProfile });
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (profileQuery.data) {
      setFullName(profileQuery.data.full_name ?? "");
      setPhone(profileQuery.data.phone ?? "");
    }
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => updateMyProfile({ full_name: fullName.trim(), phone: phone.trim() }),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (error: Error) => toast.error(error.message || "Could not update profile"),
  });

  return (
    <ShopShell>
      <h1 className="font-display text-2xl font-semibold">My profile</h1>

      {profileQuery.isLoading ? (
        <Skeleton className="mt-6 h-64 max-w-lg rounded-xl" />
      ) : (
        <div className="card-elevated mt-6 max-w-lg space-y-4 p-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={profileQuery.data?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-phone">Phone</Label>
            <Input
              id="profile-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 1234"
            />
          </div>
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      )}
    </ShopShell>
  );
}
