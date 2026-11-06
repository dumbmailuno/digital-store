import type { Metadata } from "next";
import { AuditTable } from "@/components/admin/audit-table";

export const metadata: Metadata = { title: "Audit log" };

export default function DevAudit({ searchParams }: { searchParams: { page?: string } }) {
  const page = Math.max(1, Math.min(2000, parseInt(searchParams.page ?? "1", 10) || 1));
  return (
    <div className="space-y-5">
      <h1 className="page-title-sm">Audit log</h1>
      <AuditTable basePath="/dev/audit-log" page={page} />
    </div>
  );
}
