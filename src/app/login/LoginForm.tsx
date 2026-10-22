"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button, Notice } from "@/components/ui";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "password">("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>(initialError ? { kind: "error", message: initialError } : { kind: "idle" });

  async function sendLink(trimmed: string) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) return setState({ kind: "error", message: error.message || "Could not send the link. Try again." });
    setState({ kind: "sent", email: trimmed });
  }

  async function signInWithPassword(trimmed: string) {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (error) {
      return setState({
        kind: "error",
        message: /invalid/i.test(error.message)
          ? "Email or password is wrong. If you never set a password, use the email link instead."
          : error.message,
      });
    }
    router.replace(next);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) return setState({ kind: "error", message: "Enter a valid email address." });
    if (mode === "password" && password.length < 8) return setState({ kind: "error", message: "Enter your password (at least 8 characters)." });
    setState({ kind: "busy" });
    if (mode === "link") await sendLink(trimmed);
    else await signInWithPassword(trimmed);
  }

  if (state.kind === "sent") {
    return (
      <div>
        <p className="text-lg font-semibold">Check your email</p>
        <p className="mt-2 text-sm text-muted">
          We sent a sign-in link to <span className="text-text">{state.email}</span>. Open it on this device to continue.
        </p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => setState({ kind: "idle" })}>
          Use a different email
        </Button>
      </div>
    );
  }

  const tab = (m: "link" | "password", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => {
        setMode(m);
        setState({ kind: "idle" });
      }}
      className={`flex-1 rounded px-3 py-1.5 text-sm ${mode === m ? "bg-surface-2 text-text" : "text-muted hover:text-text"}`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div role="tablist" aria-label="Sign-in method" className="flex gap-1 rounded-md border border-border p-1">
        {tab("link", "Email me a link")}
        {tab("password", "Password")}
      </div>
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="input" placeholder="you@firm.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {mode === "password" ? (
        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      ) : null}
      {state.kind === "error" ? <Notice tone="error">{state.message}</Notice> : null}
      <Button type="submit" className="w-full" disabled={state.kind === "busy"}>
        {state.kind === "busy" ? "One moment" : mode === "link" ? "Email me a sign-in link" : "Sign in"}
      </Button>
      {mode === "password" ? (
        <p className="text-xs text-muted">
          Forgot it or never set one? Switch to <button type="button" className="underline" onClick={() => setMode("link")}>email link</button>, then set a new password under Account.
        </p>
      ) : null}
    </form>
  );
}
