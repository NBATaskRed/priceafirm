import { describe, expect, it } from "vitest";
import { isBlockedDomain, normalizeUrl, registrableDomain, urlHash } from "./normalize";

function ok(raw: string) {
  const r = normalizeUrl(raw);
  if (!r.ok) throw new Error(`expected ok for ${raw}: ${r.reason}`);
  return r;
}

describe("normalizeUrl", () => {
  it("strips tracking params, keeps and sorts the rest, drops fragments", () => {
    const r = ok("https://Example.com/listing/123456?utm_source=x&b=2&fbclid=abc&a=1&gclid=zz&ref=home#section");
    expect(r.url).toBe("https://example.com/listing/123456?a=1&b=2");
    expect(r.domain).toBe("example.com");
  });

  it("strips www and lowercases the host", () => {
    const r = ok("HTTPS://WWW.Example.COM/Listing/123456/");
    expect(r.url).toBe("https://example.com/Listing/123456");
    expect(r.domain).toBe("example.com");
  });

  it("extracts canonicalKey from numeric path segments", () => {
    expect(ok("https://www.example.com/listing/123456").canonicalKey).toBe("example.com:123456");
    expect(ok("https://example.com/business-for-sale/hvac-company/987").canonicalKey).toBe("example.com:987");
  });

  it("extracts canonicalKey from known id query params", () => {
    expect(ok("https://example.com/detail.aspx?id=55512&utm_medium=email").canonicalKey).toBe("example.com:q:55512");
    expect(ok("https://example.com/view?listingId=ABC-9").canonicalKey).toBe("example.com:q:abc-9");
  });

  it("falls back to a trailing slug segment", () => {
    expect(ok("https://example.com/businesses/plumbing-company-atlanta").canonicalKey).toBe("example.com:plumbing-company-atlanta");
  });

  it("uses the registrable domain for subdomains and two-level TLDs", () => {
    expect(ok("https://listings.broker.example.com/l/1").domain).toBe("example.com");
    expect(ok("https://shop.example.co.uk/l/1").domain).toBe("example.co.uk");
    expect(registrableDomain("a.b.c.example.com.au")).toBe("example.com.au");
  });

  it("adds https when the scheme is missing", () => {
    expect(ok("example.com/listing/1").url).toBe("https://example.com/listing/1");
  });

  it("rejects non-http schemes, userinfo, IP literals, localhost, dotless hosts and odd ports", () => {
    expect(normalizeUrl("ftp://example.com/x").ok).toBe(false);
    expect(normalizeUrl("javascript:alert(1)").ok).toBe(false);
    expect(normalizeUrl("https://user:pw@example.com/x").ok).toBe(false);
    expect(normalizeUrl("http://192.168.1.10/listing/1").ok).toBe(false);
    expect(normalizeUrl("http://8.8.8.8/listing/1").ok).toBe(false);
    expect(normalizeUrl("http://[::1]/listing/1").ok).toBe(false);
    expect(normalizeUrl("http://localhost/listing/1").ok).toBe(false);
    expect(normalizeUrl("http://intranet/listing/1").ok).toBe(false);
    expect(normalizeUrl("https://example.com:8443/listing/1").ok).toBe(false);
    expect(normalizeUrl("").ok).toBe(false);
    expect(normalizeUrl("not a url at all").ok).toBe(false);
  });

  it("accepts standard ports", () => {
    expect(ok("https://example.com:443/listing/1").url).toBe("https://example.com/listing/1");
    expect(ok("http://example.com:80/listing/1").url).toBe("http://example.com/listing/1");
  });
});

describe("isBlockedDomain", () => {
  it("blocks BizBuySell and BizQuest including subdomains", () => {
    expect(isBlockedDomain("bizbuysell.com")).toBe(true);
    expect(isBlockedDomain("www.bizbuysell.com")).toBe(true);
    expect(isBlockedDomain("m.bizbuysell.com")).toBe(true);
    expect(isBlockedDomain("BizBuySell.com")).toBe(true);
    expect(isBlockedDomain("bizquest.com")).toBe(true);
    expect(isBlockedDomain("listings.bizquest.com")).toBe(true);
  });

  it("does not block unrelated or look-alike domains", () => {
    expect(isBlockedDomain("example.com")).toBe(false);
    expect(isBlockedDomain("notbizbuysell.com")).toBe(false);
    expect(isBlockedDomain("bizbuysell.com.example.org")).toBe(false);
  });

  it("works on the domain produced by normalizeUrl", () => {
    const r = ok("https://www.bizbuysell.com/Business-Opportunity/hvac/2233445/");
    expect(r.domain).toBe("bizbuysell.com");
    expect(isBlockedDomain(r.domain)).toBe(true);
  });
});

describe("urlHash", () => {
  it("is a stable sha256 hex", () => {
    expect(urlHash("https://example.com/a")).toMatch(/^[0-9a-f]{64}$/);
    expect(urlHash("https://example.com/a")).toBe(urlHash("https://example.com/a"));
    expect(urlHash("https://example.com/a")).not.toBe(urlHash("https://example.com/b"));
  });
});
