"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { useToast } from "@/components/ui/toast";

/** Customers only. Turning it on or off needs a fresh emailed code, so a stolen session can't quietly switch it off. */
export function EmailTwoFactor({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  return (
    <section className="card space-y-3" aria-labelledby="e2fa">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="e2fa" className="font-medium">Email verification at sign-in</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {enabled ? "On. After your password we email you a 6-digit code." : "Off. Turn it on to require a 6-digit emailed code after your password."}
          </p>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${enabled ? "bg-ok/10 text-ok" : "bg-paper-dim text-ink-mute"}`}>{enabled ? "On" : "Off"}</span>
      </div>
      {asking ? (
        <EmailCodeForm purpose={enabled ? "disable" : "enable"} onCancel={() => setAsking(false)}
          onVerified={() => { setAsking(false); toast("success", enabled ? "Email verification turned off" : "Email verification turned on"); router.refresh(); }} />
      ) : (
        <button className="btn" onClick={() => setAsking(true)}>{enabled ? "Turn off" : "Turn on"}</button>
      )}
    </section>
  );
}
