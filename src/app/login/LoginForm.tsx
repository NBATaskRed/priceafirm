"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button, Notice } from "@/components/ui";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string }>(
    initialError ? { kind: "error", message: initialError } : { kind: "idle" },
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setState({ kind: "error", message: "Enter a valid email address." });
      return;
    }
    setState({ kind: "sending" });
    const supabase = createSupabaseBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setState({ kind: "error", message: error.message || "Could not send the link. Try again." });
      return;
    }
    setState({ kind: "sent", email: trimmed });
  }

  if (state.kind === "sent") {
    return (
      <div>
        <p className="text-lg font-semibold">Check your email</p>
        <p className="mt-2 text-sm text-muted">
          We sent a sign-in link to <span className="text-text">{state.email}</span>. Open it on this device to continue. The link expires after a short while.
        </p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => setState({ kind: "idle" })}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="input"
          placeholder="you@firm.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={state.kind === "error" ? "true" : undefined}
          aria-describedby={state.kind === "error" ? "login-error" : undefined}
        />
      </div>
      {state.kind === "error" ? (
        <div id="login-error">
          <Notice tone="error">{state.message}</Notice>
        </div>
      ) : null}
      <Button type="submit" className="w-full" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending link" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
