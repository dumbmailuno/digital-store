"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/ui/field";
import { fieldError, nameSchema } from "@/lib/validation";

type Avatar = { id: string; name: string; url: string };

export function ProfileForm({ fullName, avatarId, avatars, emailVerified }: { fullName: string; avatarId: string | null; avatars: Avatar[]; emailVerified: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(fullName);
  const [avatar, setAvatar] = useState<string | null>(avatarId);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const err = useMemo(() => fieldError(nameSchema, name), [name]);
  const dirty = name.trim() !== fullName || avatar !== avatarId;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (err) { setTouched(true); return; }
    setBusy(true);
    // RLS + column grants: users may only change full_name and avatar_id on their own row
    const { error } = await createClient().from("profiles").update({ full_name: name.trim(), avatar_id: avatar }).eq("id", (await createClient().auth.getUser()).data.user!.id);
    setBusy(false);
    if (error) { toast("error", "Couldn't save your profile. Please try again."); return; }
    toast("success", "Profile updated");
    router.refresh();
  }

  return (
    <form onSubmit={save} noValidate className="card space-y-4">
      <Field label="Full name" value={name} onChange={setName} onBlur={() => setTouched(true)} autoComplete="name" error={err} valid={!err} touched={touched} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Avatar</legend>
        {!emailVerified && <p className="mb-2 text-xs text-warn">Verify your email to use a custom avatar.</p>}
        <div className={`grid grid-cols-4 gap-2 sm:grid-cols-6 ${emailVerified ? "" : "pointer-events-none opacity-50"}`}>
          {avatars.map((a) => (
            <label key={a.id} className={`flex aspect-square cursor-pointer items-center justify-center rounded-2xl border p-2 ${avatar === a.id ? "border-accent bg-paper-dim" : "border-paper-line"}`}>
              <input type="radio" name="avatar" className="sr-only" checked={avatar === a.id} onChange={() => setAvatar(a.id)} />
              <img src={a.url} alt={a.name} className="h-full w-full" />
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn" disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</button>
    </form>
  );
}
