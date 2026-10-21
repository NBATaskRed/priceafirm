import { createHash } from "node:crypto";

/**
 * URL normalization, blocklist and hashing. Pure: no database or network access, so it is safe
 * to run before anything else and to import from tests.
 */

export type NormalizedUrl =
  | { ok: true; url: string; domain: string; canonicalKey: string }
  | { ok: false; reason: string };

/** Query parameters that only carry tracking state and never identify a listing. */
const TRACKING_PARAM_EXACT = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "yclid",
  "twclid",
  "ttclid",
  "ref",
  "ref_",
  "referrer",
  "referer",
  "source",
  "src",
  "campaign",
  "medium",
  "cmp",
  "mkt_tok",
  "_hsenc",
  "_hsmi",
  "_ga",
  "_gl",
  "s_kwcid",
  "trk",
  "trkid",
  "spm",
  "si",
]);
const TRACKING_PARAM_PREFIXES = ["utm_", "hsa_", "pk_", "mtm_", "oly_", "vero_", "_branch_", "ic_"];

/** Query parameters that commonly identify a listing on broker sites. */
const ID_QUERY_PARAMS = ["listingid", "listing_id", "listing", "id", "lid", "bid", "businessid", "business_id", "ad", "adid", "ad_id"];

/** Second-level public suffixes under which the registrable domain has three labels. */
const TWO_LEVEL_TLDS = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "me.uk",
  "net.uk",
  "ltd.uk",
  "plc.uk",
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "co.nz",
  "net.nz",
  "org.nz",
  "co.za",
  "org.za",
  "com.br",
  "net.br",
  "org.br",
  "com.mx",
  "org.mx",
  "co.in",
  "net.in",
  "org.in",
  "co.jp",
  "ne.jp",
  "or.jp",
  "com.sg",
  "com.hk",
  "com.cn",
  "net.cn",
  "org.cn",
  "com.tw",
  "co.kr",
  "com.ar",
  "com.co",
  "com.pe",
  "com.tr",
  "com.ph",
  "com.my",
  "co.il",
  "com.pl",
  "com.ua",
]);

/**
 * Hard block, enforced before any database lookup or network request. Covers the named domains,
 * every subdomain of them, and known aliases / redirect domains of the same publishers.
 */
const BLOCKED_DOMAINS = [
  "bizbuysell.com",
  "bizquest.com",
  // alias / redirect domains of the same two properties
  "bizbuysell.ca",
  "bizbuysell.co.uk",
  "bizbuysell.net",
  "bizbuysell.org",
  "bizquest.net",
  "bizquest.org",
];

export function isBlockedDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  if (!d) return false;
  return BLOCKED_DOMAINS.some((b) => d === b || d.endsWith(`.${b}`));
}

export function urlHash(url: string): string {
  return createHash("sha256").update(url, "utf8").digest("hex");
}

function isIpLiteral(host: string): boolean {
  if (/^\[.*\]$/.test(host)) return true; // bracketed IPv6
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // IPv4 dotted quad
  if (/^[0-9a-f:]+$/i.test(host) && host.includes(":")) return true; // bare IPv6
  if (/^\d+$/.test(host)) return true; // decimal integer form
  if (/^0x[0-9a-f]+$/i.test(host)) return true; // hex form
  return false;
}

function isTrackingParam(name: string): boolean {
  const n = name.toLowerCase();
  if (TRACKING_PARAM_EXACT.has(n)) return true;
  return TRACKING_PARAM_PREFIXES.some((p) => n.startsWith(p));
}

/** Registrable domain: last two labels, or last three under a known two-level public suffix. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (TWO_LEVEL_TLDS.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join(".");
  return lastTwo;
}

const GENERIC_SEGMENTS = new Set([
  "listing",
  "listings",
  "business",
  "businesses",
  "business-for-sale",
  "businesses-for-sale",
  "for-sale",
  "detail",
  "details",
  "view",
  "index",
  "index.html",
  "index.php",
  "index.asp",
  "index.aspx",
  "default.aspx",
  "page",
  "p",
  "l",
  "en",
  "us",
]);

/** Best-effort listing id from the path or query. Falls back to the normalized path. */
function extractListingId(pathname: string, params: URLSearchParams): string {
  for (const key of ID_QUERY_PARAMS) {
    for (const [k, v] of params.entries()) {
      if (k.toLowerCase() === key && v.trim()) return `q:${v.trim().toLowerCase()}`;
    }
  }
  const segments = pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  // Last purely numeric segment wins (e.g. /listing/123456, /hvac-company/987).
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(segments[i])) return segments[i];
  }
  // A slug that ends in a numeric id (e.g. hvac-company-987, listing-123456.html).
  for (let i = segments.length - 1; i >= 0; i--) {
    const m = segments[i].match(/(\d{3,})(?:\.[a-z]+)?$/);
    if (m) return m[1];
  }
  // Otherwise the trailing non-generic slug segment.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].replace(/\.(html?|php|aspx?)$/, "");
    if (seg && !GENERIC_SEGMENTS.has(seg)) return seg;
  }
  return pathname || "/";
}

export function normalizeUrl(raw: string): NormalizedUrl {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Enter a listing URL." };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That does not look like a valid URL." };
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are accepted." };
  }
  if (u.username || u.password) {
    return { ok: false, reason: "URLs with embedded credentials are not accepted." };
  }

  let host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "The URL has no host." };
  if (isIpLiteral(host)) return { ok: false, reason: "IP address hosts are not accepted; use the site's domain name." };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "Local hosts are not accepted." };
  }
  if (!host.includes(".")) return { ok: false, reason: "The host must be a public domain name." };
  if (!/^[a-z0-9.-]+$/.test(host) || host.split(".").some((l) => !l || l.startsWith("-") || l.endsWith("-"))) {
    return { ok: false, reason: "The host name contains invalid characters." };
  }
  if (u.port && u.port !== "80" && u.port !== "443") {
    return { ok: false, reason: "Only standard web ports are accepted." };
  }

  host = host.replace(/^www\./, "");
  const domain = registrableDomain(host);
  if (!domain.includes(".")) return { ok: false, reason: "The host must be a public domain name." };

  const kept: [string, string][] = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (!k || isTrackingParam(k)) continue;
    kept.push([k, v]);
  }
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const params = new URLSearchParams();
  for (const [k, v] of kept) params.append(k, v);

  let pathname = u.pathname || "/";
  pathname = pathname.replace(/\/{2,}/g, "/");
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);

  const query = params.toString();
  const url = `${u.protocol}//${host}${pathname}${query ? `?${query}` : ""}`;
  const listingId = extractListingId(pathname, params);
  const canonicalKey = `${domain}:${listingId}`;

  return { ok: true, url, domain, canonicalKey };
}
