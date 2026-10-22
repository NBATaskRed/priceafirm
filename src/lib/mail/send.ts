import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { RenderedEmail } from "./templates";

export type MailStatus = "sent" | "captured" | "failed";

/**
 * Record every email in mail_outbox, then send it through Resend when RESEND_API_KEY and MAIL_FROM are set
 * and MAIL_CAPTURE is not "1". Otherwise the email is only captured (visible in Admin > Invites).
 */
export async function sendEmail(input: {
  to: string;
  kind: string;
  email: RenderedEmail;
  relatedInvite?: string | null;
  /** Secrets (e.g. sign-in links) to strip from the stored copy. The delivered email keeps them. */
  redact?: string[];
}): Promise<{ status: MailStatus; error?: string; outboxId: string }> {
  const db = supabaseAdmin();
  const scrub = (t: string) => (input.redact ?? []).reduce((acc, secret) => acc.split(secret).join("[sign-in link]"), t);
  const { data, error } = await db
    .from("mail_outbox")
    .insert({ kind: input.kind, to_email: input.to, subject: input.email.subject, text_body: scrub(input.email.text), html_body: scrub(input.email.html), related_invite: input.relatedInvite ?? null })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Could not write outbox");
  const outboxId = (data as { id: string }).id;

  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from || process.env.MAIL_CAPTURE === "1") {
    await db.from("mail_outbox").update({ status: "captured" }).eq("id", outboxId);
    return { status: "captured", outboxId };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.email.subject,
        html: input.email.html,
        text: input.email.text,
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      const msg = `Resend ${res.status}: ${body.message ?? "error"}`.slice(0, 500);
      await db.from("mail_outbox").update({ status: "failed", error: msg }).eq("id", outboxId);
      return { status: "failed", error: msg, outboxId };
    }
    await db.from("mail_outbox").update({ status: "sent", provider_id: body.id ?? null, sent_at: new Date().toISOString() }).eq("id", outboxId);
    return { status: "sent", outboxId };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db.from("mail_outbox").update({ status: "failed", error: msg }).eq("id", outboxId);
    return { status: "failed", error: msg, outboxId };
  }
}
