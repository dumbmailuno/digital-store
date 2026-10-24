import type { Metadata } from "next";
import { AuditTable } from "@/components/admin/audit-table";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditLog({ searchParams }: { searchParams: { page?: string } }) {
  const page = Math.max(1, Math.min(2000, parseInt(searchParams.page ?? "1", 10) || 1));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-ink-soft">Changes to products, wallets and payments, and to the subscription. Entries can't be edited or deleted.</p>
      <AuditTable basePath="/admin/audit-log" page={page} />
    </div>
  );
}
