"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { markPasswordSetAction } from "@/lib/actions/account";
import { Button, Notice } from "@/components/ui";

export function SetPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "done" } | { kind: "error"; message: string }>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pw.length < 8) return setState({ kind: "error", message: "Use at least 8 characters." });
    if (pw !== pw2) return setState({ kind: "error", message: "The two passwords do not match." });
    setState({ kind: "busy" });
    const { error } = await createSupabaseBrowserClient().auth.updateUser({ password: pw });
    if (error) return setState({ kind: "error", message: error.message });
    await markPasswordSetAction();
    setPw("");
    setPw2("");
    setState({ kind: "done" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="pw" className="label">
          {hasPassword ? "New password" : "Password"}
        </label>
        <input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div>
        <label htmlFor="pw2" className="label">
          Confirm password
        </label>
        <input id="pw2" type="password" autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      {state.kind === "error" ? <Notice tone="error">{state.message}</Notice> : null}
      {state.kind === "done" ? <Notice tone="success">Password saved. You can now sign in with your email and this password, or keep using email links.</Notice> : null}
      <Button type="submit" disabled={state.kind === "busy"}>
        {state.kind === "busy" ? "Saving" : hasPassword ? "Change password" : "Set password"}
      </Button>
    </form>
  );
}
