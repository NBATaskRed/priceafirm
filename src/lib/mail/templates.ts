/** Email templates. Plain, short, no em dashes (house style). Light theme, inline styles (spec 4.1). */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Pre-formatted listing facts for the fact strip, e.g. { ask: "$2.9M", revenue: "$3.2M", earningsLabel: "SDE", earnings: "$680K" }. */
export interface EmailFacts {
  ask: string;
  revenue: string;
  earningsLabel: string;
  earnings: string;
}

const UI = "'Hanken Grotesk',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const FIG = "'Archivo','Hanken Grotesk',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = "#17181A";
const MUTED = "#5F5B54";

export function valuationRequestEmail(p: {
  firstName: string | null;
  headline: string;
  /** "Tampa Bay, FL": used in the subject. */
  location: string | null;
  url: string;
  expiresDays: number;
  /** "Tampa Bay": used in the body ("in Tampa Bay"). Falls back to location. */
  metro?: string | null;
  /** Who the buyer requested materials from, for the footer. */
  broker?: string | null;
  facts?: EmailFacts | null;
}): RenderedEmail {
  const where = p.location ? ` (${p.location})` : "";
  const inPlace = (p.metro ?? p.location) ? ` in ${p.metro ?? p.location}` : "";
  const hi = p.firstName ? `Hi ${p.firstName},` : "Hi,";
  const subject = `What is ${p.headline}${where} worth to you?`;
  const ask = `You've had the materials on ${p.headline}${inPlace} for a couple of weeks. What do you think it's worth?`;
  const how = "One number and how sure you are. Under a minute. Your number stays private; other buyers only see the combined view.";
  const note = "The button signs you in, no password needed. You'll start with 3 points, and good calls earn more.";
  const why = p.broker ? `You're getting this because you requested materials on this listing from ${p.broker}.` : "You're getting this because you requested materials on this listing.";
  const footer = `The link works for ${p.expiresDays} days. After that, sign in at PriceAFirm with this email for a fresh link. ${why}`;
  const f = p.facts ?? null;

  const lines = [hi, "", ask, "", how, ""];
  if (f) lines.push(`Asking ${f.ask} · Revenue ${f.revenue} · ${f.earningsLabel} ${f.earnings}`, "");
  lines.push(`Value this business (this link signs you in): ${p.url}`, "", note, "", footer);
  const text = lines.join("\n");

  const cell = (label: string, value: string, align: "left" | "center" | "right") =>
    `<td style="padding:0;text-align:${align};vertical-align:top"><div style="font-family:${UI};font-size:14px;color:${MUTED}">${esc(label)}</div><div style="font-family:${FIG};font-stretch:118%;font-variant-numeric:tabular-nums;font-size:22px;font-weight:700;color:${INK};margin-top:4px">${esc(value)}</div></td>`;
  const strip = f
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#F6F3EE;border-radius:12px;margin:0 0 18px"><tr><td style="padding:18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cell("Asking", f.ask, "left")}${cell("Revenue", f.revenue, "center")}${cell(f.earningsLabel, f.earnings, "right")}</tr></table></td></tr></table>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;padding:28px 16px;background:#EDE9E1;font-family:${UI};color:${INK}">
<div style="max-width:600px;margin:0 auto">
<div style="background:#FFFFFF;border-radius:14px;padding:32px;font-size:16px;line-height:1.55">
<p style="margin:0 0 18px">${esc(hi)}</p>
<p style="margin:0 0 18px">You've had the materials on <strong>${esc(p.headline)}</strong>${esc(inPlace)} for a couple of weeks. What do you think it's worth?</p>
<p style="margin:0 0 18px">${esc(how)}</p>
${strip}<a href="${esc(p.url)}" style="display:block;text-align:center;background:#F5A524;color:${INK};text-decoration:none;font-weight:700;font-size:17px;line-height:52px;height:52px;border-radius:12px;margin:0 0 18px">Value this business</a>
<p style="margin:0;font-size:14px;color:${MUTED}">${esc(note)}</p>
</div>
<p style="margin:16px 4px 0;font-size:12px;line-height:1.5;color:${MUTED}">${esc(footer)}</p>
</div>
</body></html>`;
  return { subject, text, html };
}
