"use server";

import { requireMember } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Called by the client after supabase.auth.updateUser({ password }) succeeds. */
export async function markPasswordSetAction(): Promise<void> {
  const { user } = await requireMember();
  await supabaseAdmin().from("profiles").update({ password_set: true }).eq("id", user.id);
}
