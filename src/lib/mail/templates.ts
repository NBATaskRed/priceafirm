/** Email templates. Plain, short, no em dashes (house style). */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function valuationRequestEmail(p: {
  firstName: string | null;
  headline: string;
  location: string | null;
  url: string;
  expiresDays: number;
}): RenderedEmail {
  const where = p.location ? ` (${p.location})` : "";
  const hi = p.firstName ? `Hi ${p.firstName},` : "Hi,";
  const subject = `What is ${p.headline}${where} worth to you?`;
  const lines = [
    hi,
    "",
    `You've had the materials on ${p.headline}${where} for a little while. What do you think it is worth?`,
    "",
    "It takes under a minute: one number and how confident you are. Your valuation is private. Other buyers only ever see aggregate figures, never who said what.",
    "",
    `Value it here (this link signs you in): ${p.url}`,
    "",
    `The link works for ${p.expiresDays} days. After that, sign in at PriceAFirm with this email address to get a fresh link, or set a password once you're in.`,
  ];
  const text = lines.join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f4f0;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#141414">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:28px">
<p style="margin:0 0 16px">${esc(hi)}</p>
<p style="margin:0 0 16px">You've had the materials on <strong>${esc(p.headline)}</strong>${esc(where)} for a little while. What do you think it is worth?</p>
<p style="margin:0 0 24px">It takes under a minute: one number and how confident you are. Your valuation is private. Other buyers only ever see aggregate figures, never who said what.</p>
<p style="margin:0 0 24px"><a href="${esc(p.url)}" style="display:inline-block;background:#f5a524;color:#141414;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">Value this business</a></p>
<p style="margin:0;font-size:13px;color:#6b665e">This button signs you in. It works for ${p.expiresDays} days; after that, sign in with this email address for a fresh link, or set a password once you're in.</p>
</div>
<p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#8a857c">PriceAFirm</p>
</body></html>`;
  return { subject, text, html };
}
