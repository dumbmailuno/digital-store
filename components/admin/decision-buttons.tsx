"use client";

import { Guard } from "@/components/admin/read-only";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

export function DecisionButtons({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(decision: "approve" | "reject") {
    if (busy) return;
    if (decision === "reject" && !note.trim()) { toast("error", "Add a short reason so the customer knows why."); return; }
    setBusy(true);
    const res = await fetch(`/api/admin/payments/${paymentId}/decision`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, note: note.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast("error", json?.error?.message ?? "Couldn't save the decision."); return; }
    toast("success", decision === "approve" ? (json.status === "fulfilled" ? "Approved. Download email sent." : "Approved. The download email will retry shortly.") : "Payment rejected. The customer was notified.");
    setMode("idle"); setNote(""); router.refresh();
  }

  if (mode === "idle") return (
    <Guard><div className="flex flex-wrap gap-2">
      <button className="btn" onClick={() => setMode("approve")}>Approve…</button>
      <button className="btn btn-ghost" onClick={() => setMode("reject")}>Reject…</button>
    </div></Guard>
  );

  return (
    <Guard>
    <div className="space-y-2 rounded-2xl border border-paper-line bg-paper-dim p-3">
      <p className="text-sm font-medium">{mode === "approve" ? "Approve this payment and email the download links?" : "Reject this payment?"}</p>
      <label className="block text-xs text-ink-soft" htmlFor={`n-${paymentId}`}>{mode === "reject" ? "Reason (sent to the customer)" : "Note (optional, kept in the audit trail)"}</label>
      <textarea id={`n-${paymentId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="input min-h-[72px] py-2" />
      <div className="flex gap-2">
        <button className={`btn ${mode === "reject" ? "bg-bad hover:bg-bad/90" : ""}`} disabled={busy} onClick={() => send(mode)}>
          {busy ? "Saving…" : mode === "approve" ? "Yes, approve" : "Yes, reject"}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => { setMode("idle"); setNote(""); }}>Cancel</button>
      </div>
    </div>
    </Guard>
  );
}
