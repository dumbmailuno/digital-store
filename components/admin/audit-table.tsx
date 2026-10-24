import { createClient } from "@/lib/supabase/server";
import { Pager } from "./pager";
import { when } from "@/lib/labels";

const PAGE = 50;

/** Shared by /admin/audit-log and /dev/audit-log. Read-only; RLS limits it to verified staff. */
export async function AuditTable({ basePath, page }: { basePath: string; page: number }) {
  const supabase = createClient();
  const { data, count } = await supabase.from("audit_logs")
    .select("id, action, resource_type, resource_id, old_value, new_value, created_at, profiles(full_name, email)", { count: "exact" })
    .order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const rows = (data ?? []) as any[];

  return (
    <>
      {rows.length === 0 ? <div className="card text-sm text-ink-soft">No activity recorded yet.</div> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card p-3 sm:p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <p><b>{r.action}</b> <span className="text-ink-soft">{r.resource_type}</span> <span className="font-mono text-xs text-ink-mute">{r.resource_id}</span></p>
                <p className="text-xs text-ink-mute">{when(r.created_at)}</p>
              </div>
              <p className="text-xs text-ink-soft">{r.profiles ? `${r.profiles.full_name} (${r.profiles.email})` : "System / server"}</p>
              {(r.old_value || r.new_value) && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-ink-soft hover:underline">Details</summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {r.old_value && <div><p className="mb-1 text-ink-mute">Before</p><pre className="max-h-48 overflow-auto rounded border border-paper-line bg-paper-dim p-2">{JSON.stringify(r.old_value, null, 2)}</pre></div>}
                    {r.new_value && <div><p className="mb-1 text-ink-mute">After</p><pre className="max-h-48 overflow-auto rounded border border-paper-line bg-paper-dim p-2">{JSON.stringify(r.new_value, null, 2)}</pre></div>}
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager basePath={basePath} params={{}} page={page} pages={Math.max(1, Math.ceil((count ?? 0) / PAGE))} />
    </>
  );
}
