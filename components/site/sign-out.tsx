"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";

export function SignOutButton() {
  const router = useRouter();
  const toast = useToast();
  return (
    <button className="inline-flex min-h-[40px] items-center hover:underline" onClick={async () => {
      await createClient().auth.signOut();
      toast("info", "You've been signed out.");
      router.push("/");
      router.refresh();
    }}>Sign out</button>
  );
}
