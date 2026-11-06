"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

export function SignOutButton({ onSignOut }: { onSignOut?: () => void } = {}) {
  const router = useRouter();
  const toast = useToast();
  return (
    <button onClick={async () => {
      await createClient().auth.signOut();
      onSignOut?.();
      toast("info", "You've been signed out.");
      router.push("/");
      router.refresh();
    }} className="inline-flex min-h-10 items-center rounded-full px-3 text-[13px] font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white">Sign out</button>
  );
}
