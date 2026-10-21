import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { registrableDomain } from "./normalize";

/**
 * SSRF-safe HTML fetch for approved listing sources. Never throws.
 *
 * - Resolves the host with DNS and rejects private / loopback / link-local / metadata ranges.
 * - Follows at most MAX_REDIRECTS redirects, only within the allowed registrable domain, re-checking DNS per hop.
 * - 10s overall timeout, text/html only, body capped at 2 MB.
 */

export type SafeFetchResult = { ok: true; html: string; finalUrl: string } | { ok: false; reason: string };

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
export const USER_AGENT = "PriceAFirmBot/0.1 (+contact in README)";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inCidr4(ip: number, base: string, bits: number): boolean {
  const b = ipv4ToInt(base);
  if (b == null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ip & mask) >>> 0) === ((b & mask) >>> 0);
}

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** Expand an IPv6 textual address into eight 16-bit groups; null when malformed. */
function parseIpv6(ip: string): number[] | null {
  let addr = ip.toLowerCase();
  // IPv4-mapped suffix (::ffff:1.2.3.4)
  const v4Match = addr.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4Match) {
    const n = ipv4ToInt(v4Match[2]);
    if (n == null) return null;
    addr = `${v4Match[1]}${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill("0"), ...tail].map((g) => parseInt(g || "0", 16));
  if (groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const n = ipv4ToInt(ip);
    if (n == null) return true;
    return PRIVATE_V4.some(([base, bits]) => inCidr4(n, base, bits));
  }
  if (family === 6) {
    const g = parseIpv6(ip);
    if (!g) return true;
    const allZero = g.every((x) => x === 0);
    if (allZero) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): check the embedded v4.
    const mappedPrefix = g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0);
    if (mappedPrefix) {
      const v4 = ((g[6] << 16) | g[7]) >>> 0;
      return PRIVATE_V4.some(([base, bits]) => inCidr4(v4, base, bits));
    }
    // 64:ff9b::/96 NAT64 and 2002::/16 6to4 embed v4 too
    if (g[0] === 0x0064 && g[1] === 0xff9b) {
      const v4 = ((g[6] << 16) | g[7]) >>> 0;
      return PRIVATE_V4.some(([base, bits]) => inCidr4(v4, base, bits));
    }
    if (g[0] === 0x2002) {
      const v4 = ((g[1] << 16) | g[2]) >>> 0;
      return PRIVATE_V4.some(([base, bits]) => inCidr4(v4, base, bits));
    }
    return false;
  }
  return true; // not an IP at all: treat as unsafe
}

async function resolveAndCheck(hostname: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    return isPrivateAddress(host) ? { ok: false, reason: "Host resolves to a non-public address." } : { ok: true };
  }
  if (host === "localhost" || host.endsWith(".localhost") || !host.includes(".")) {
    return { ok: false, reason: "Host is not a public domain." };
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true, order: "verbatim" });
  } catch {
    return { ok: false, reason: `Could not resolve ${host}.` };
  }
  if (!addrs.length) return { ok: false, reason: `Could not resolve ${host}.` };
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) return { ok: false, reason: "Host resolves to a non-public address." };
  }
  return { ok: true };
}

async function readCapped(res: Response, signal: AbortSignal): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const body = res.body;
  if (!body) return { ok: true, text: "" };
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    try {
      await body.cancel();
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "Page is larger than 2 MB." };
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) return { ok: false, reason: "Fetch timed out." };
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          return { ok: false, reason: "Page is larger than 2 MB." };
        }
        chunks.push(value);
      }
    }
  } catch (e) {
    return { ok: false, reason: signal.aborted ? "Fetch timed out." : `Read failed: ${(e as Error).message}` };
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }
  return { ok: true, text: new TextDecoder("utf-8", { fatal: false }).decode(merged) };
}

export async function safeFetch(url: string, allowedDomain: string): Promise<SafeFetchResult> {
  const allowed = allowedDomain.trim().toLowerCase().replace(/^www\./, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let current: URL;
    try {
      current = new URL(url);
    } catch {
      return { ok: false, reason: "Invalid URL." };
    }

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        return { ok: false, reason: "Only http and https URLs can be fetched." };
      }
      if (current.username || current.password) return { ok: false, reason: "Credentials in URL are not allowed." };
      if (current.port && current.port !== "80" && current.port !== "443") {
        return { ok: false, reason: "Non-standard ports are not allowed." };
      }
      const host = current.hostname.toLowerCase();
      if (registrableDomain(host) !== allowed) {
        return { ok: false, reason: `Fetch left the approved domain (${allowed}).` };
      }
      const dns = await resolveAndCheck(host);
      if (!dns.ok) return dns;

      let res: Response;
      try {
        res = await fetch(current.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "user-agent": USER_AGENT,
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            "accept-language": "en-US,en;q=0.8",
          },
          cache: "no-store",
        });
      } catch (e) {
        if (controller.signal.aborted) return { ok: false, reason: "Fetch timed out after 10 seconds." };
        return { ok: false, reason: `Network error: ${(e as Error).message}` };
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        if (!loc) return { ok: false, reason: "Redirect without a location." };
        if (hop === MAX_REDIRECTS) return { ok: false, reason: "Too many redirects." };
        let next: URL;
        try {
          next = new URL(loc, current);
        } catch {
          return { ok: false, reason: "Redirect to an invalid URL." };
        }
        current = next;
        continue;
      }

      if (!res.ok) {
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        return { ok: false, reason: `Source returned HTTP ${res.status}.` };
      }

      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!ct.includes("text/html") && !ct.includes("application/xhtml+xml")) {
        try {
          await res.body?.cancel();
        } catch {
          /* ignore */
        }
        return { ok: false, reason: `Source returned ${ct || "an unknown content type"}, not HTML.` };
      }

      const body = await readCapped(res, controller.signal);
      if (!body.ok) return body;
      return { ok: true, html: body.text, finalUrl: current.toString() };
    }
    return { ok: false, reason: "Too many redirects." };
  } catch (e) {
    if (controller.signal.aborted) return { ok: false, reason: "Fetch timed out after 10 seconds." };
    return { ok: false, reason: `Fetch failed: ${(e as Error)?.message ?? "unknown error"}` };
  } finally {
    clearTimeout(timer);
  }
}
