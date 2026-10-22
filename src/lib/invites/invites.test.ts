import { describe, expect, it } from "vitest";
import { bearerMatches, firstName, hashInviteToken, inviteRequestSchema, looksLikeInviteToken, newInviteToken } from "./token";
import { valuationRequestEmail } from "@/lib/mail/templates";

describe("invite tokens", () => {
  it("are random, URL-safe and hashed deterministically", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).not.toBe(b);
    expect(looksLikeInviteToken(a)).toBe(true);
    expect(hashInviteToken(a)).toBe(hashInviteToken(a));
    expect(hashInviteToken(a)).toHaveLength(64);
    expect(looksLikeInviteToken("../etc/passwd")).toBe(false);
  });
  it("bearer check is exact and requires a real secret", () => {
    const secret = "s3cret-s3cret-s3cret";
    expect(bearerMatches(`Bearer ${secret}`, secret)).toBe(true);
    expect(bearerMatches(`Bearer ${secret}x`, secret)).toBe(false);
    expect(bearerMatches(null, secret)).toBe(false);
    expect(bearerMatches("Bearer short", "short")).toBe(false);
  });
});

describe("invite request schema", () => {
  it("normalizes email and defaults to cim", () => {
    const r = inviteRequestSchema.parse({ buyer_name: " jane doe ", buyer_email: " Jane@Fund.COM ", listing_url: "https://www.synergybb.com/listings/123" });
    expect(r.buyer_email).toBe("jane@fund.com");
    expect(r.information_level).toBe("cim");
    expect(r.resend).toBe(false);
    expect(firstName(r.buyer_name)).toBe("Jane");
  });
  it("rejects bad input", () => {
    expect(inviteRequestSchema.safeParse({ buyer_name: "x", buyer_email: "nope", listing_url: "https://x.co/1" }).success).toBe(false);
    expect(inviteRequestSchema.safeParse({ buyer_name: "", buyer_email: "a@b.co", listing_url: "https://x.co/1" }).success).toBe(false);
    expect(inviteRequestSchema.safeParse({ buyer_name: "x", buyer_email: "a@b.co", listing_url: "" }).success).toBe(false);
  });
});

describe("valuation request email", () => {
  const e = valuationRequestEmail({ firstName: "Jane", headline: "HVAC services", location: "Tampa Bay, FL", url: "https://app.example/invite/abc", expiresDays: 30 });
  it("is short, personal, links once, and uses no em dashes", () => {
    expect(e.subject).toBe("What is HVAC services (Tampa Bay, FL) worth to you?");
    expect(e.text).toContain("Hi Jane,");
    expect(e.text).toContain("https://app.example/invite/abc");
    expect(e.html).toContain('href="https://app.example/invite/abc"');
    for (const s of [e.subject, e.text, e.html]) expect(s).not.toMatch(/—/);
    expect(e.text.split(/\s+/).length).toBeLessThan(120);
  });
  it("escapes HTML in listing names", () => {
    const x = valuationRequestEmail({ firstName: null, headline: "<b>A&B</b>", location: null, url: "https://x", expiresDays: 7 });
    expect(x.html).toContain("&lt;b&gt;A&amp;B&lt;/b&gt;");
    expect(x.text.startsWith("Hi,")).toBe(true);
  });
});
