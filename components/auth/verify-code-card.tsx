"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { useToast } from "@/components/ui/toast";

export function VerifyCodeCard() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const raw = params.get("next") ?? "/account";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";
  return (
    <EmailCodeForm purpose="login"
      onVerified={() => { toast("success", "Verified"); router.push(next); router.refresh(); }}
      onCancel={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }} />
  );
}
