import { stateCode, STATE_NAME_PATTERN } from "./usStates";
import { GENERIC_TAGS, tagsInText } from "@/lib/search/industries";

/**
 * Listing fact extraction from fetched HTML. Pure (no DOM, no network, no dependencies).
 *
 * Only structured facts are extracted: title, industry guess, location, and labeled money amounts.
 * Description prose is never copied; at most the title is stored verbatim (as listing_title_raw).
 */

export type FactSource = "jsonld" | "meta" | "label" | "none";

export interface ExtractedFacts {
  title?: string;
  industry?: string;
  state?: string;
  metro?: string;
  askingPrice?: number;
  revenue?: number;
  earnings?: number;
  earningsType?: "sde" | "ebitda" | "seller_cash_flow" | "unknown";
  includesInventory?: boolean;
  includesRealEstate?: boolean;
  fields: Record<string, { value: unknown; source: FactSource }>;
  quality: "high" | "low";
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  bull: "*",
  middot: "*",
  copy: "(c)",
  reg: "(R)",
  trade: "(TM)",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, body: string) => {
    const b = body.toLowerCase();
    if (b.startsWith("#x")) {
      const cp = parseInt(b.slice(2), 16);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    if (b.startsWith("#")) {
      const cp = parseInt(b.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[b] ?? m;
  });
}

/** Visible text content: scripts/styles/comments removed, tags replaced by spaces, whitespace collapsed. */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|template|svg|iframe|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, " \n ");
  // Row-ending tags become line breaks; cell-ending tags (td/th/dt) stay on the same line so a
  // label in one cell can be paired with the value in the next.
  s = s.replace(/<\/(p|div|li|tr|dd|h[1-6]|section|article|header|footer|table|ul|ol|dl)\s*>/gi, " \n ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(/[ \t\r\f\v]+/g, " ");
  s = s.replace(/\s*\n\s*/g, " \n ");
  s = s.replace(/(\s*\n\s*){2,}/g, " \n ");
  return s.trim();
}

function parseAttributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

function metaContent(html: string, keys: string[]): string | undefined {
  const wanted = new Set(keys.map((k) => k.toLowerCase()));
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = parseAttributes(m[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    if (wanted.has(key) && attrs.content?.trim()) return cleanTitle(attrs.content);
  }
  return undefined;
}

function cleanTitle(raw: string): string | undefined {
  const t = decodeEntities(raw).replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > 200 ? `${t.slice(0, 197)}...` : t;
}

// ---------------------------------------------------------------------------
// Money parsing
// ---------------------------------------------------------------------------

/** One money amount: "$2,900,000", "$3.2M", "850K", "1.2 million", "$2.9MM", "2,900,000 USD". */
const MONEY_RE =
  /(?:(\$|US\$|USD\s?)\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(million|mil|mm|m|thousand|k|bn|billion|b)?(?![\d,.]*%)(?=$|[^a-zA-Z0-9])/i;

export function parseMoney(text: string): number | null {
  const m = MONEY_RE.exec(text);
  if (!m) return null;
  const hasDollar = Boolean(m[1]);
  const numRaw = m[2];
  const suffix = (m[3] ?? "").toLowerCase();
  const grouped = numRaw.includes(",");
  // Reject bare numbers with neither a currency marker, a magnitude suffix nor thousands grouping.
  if (!hasDollar && !suffix && !grouped) return null;
  const n = Number(numRaw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  let mult = 1;
  if (suffix === "k" || suffix === "thousand") mult = 1_000;
  else if (suffix === "m" || suffix === "mm" || suffix === "mil" || suffix === "million") mult = 1_000_000;
  else if (suffix === "b" || suffix === "bn" || suffix === "billion") mult = 1_000_000_000;
  const value = Math.round(n * mult);
  // Listing-sized sanity window: under $1K or over $10B is noise (years, phone numbers, square feet).
  if (value < 1_000 || value > 10_000_000_000) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Label scanning
// ---------------------------------------------------------------------------

type LabelKind = "askingPrice" | "revenue" | "sde" | "ebitda" | "seller_cash_flow" | "net_income";

const LABELS: { kind: LabelKind; pattern: RegExp }[] = [
  { kind: "askingPrice", pattern: /\b(?:asking\s+price|list(?:ing)?\s+price|sale\s+price|purchase\s+price|offered\s+at|asking)\b/gi },
  { kind: "sde", pattern: /\b(?:seller'?s?\s+discretionary\s+(?:earnings|income|cash\s+flow)|discretionary\s+earnings|s\.?d\.?e\.?|sde)\b/gi },
  { kind: "ebitda", pattern: /\b(?:adjusted\s+ebitda|adj\.?\s+ebitda|ebitda|e\.b\.i\.t\.d\.a\.?)\b/gi },
  { kind: "seller_cash_flow", pattern: /\b(?:(?:owner'?s?\s+|seller'?s?\s+|annual\s+|net\s+)?cash\s*flow)\b/gi },
  { kind: "net_income", pattern: /\b(?:net\s+income|net\s+profit|net\s+earnings|net\s+operating\s+income)\b/gi },
  { kind: "revenue", pattern: /\b(?:gross\s+revenue|annual\s+revenue|total\s+revenue|gross\s+sales|annual\s+sales|gross\s+income|gross\s+receipts|revenue|sales|turnover)\b/gi },
  { kind: "askingPrice", pattern: /\bprice\b(?!\s+(?:reduced|range|per|history|drop|change|guide))/gi },
];

const NOT_DISCLOSED_RE = /^\s*[:\-–—]?\s*(?:not\s+disclosed|undisclosed|n\/?a|tbd|call|contact|confidential|upon\s+request|negotiable|see\s+details)\b/i;

/** Amount immediately following a label (same line, within a short window). */
function amountAfterLabel(text: string, labelEnd: number): number | null {
  const window = text.slice(labelEnd, labelEnd + 48);
  // Stop at the next newline marker so a label in one cell never grabs an amount from another row.
  const sameLine = window.split("\n")[0] ?? "";
  if (NOT_DISCLOSED_RE.test(sameLine)) return null;
  // Allow separators and a currency marker, then require the amount to begin promptly.
  const lead = /^[\s:\-–—=|•·*]*(?:\(?\s*(?:usd|us)\s*\)?\s*)?(?:approx(?:imately)?\.?\s*|about\s*|~\s*)?/i.exec(sameLine);
  const rest = sameLine.slice(lead ? lead[0].length : 0);
  if (!/^(?:\$|US\$|USD|\d)/i.test(rest)) return null;
  return parseMoney(rest);
}

interface LabelHit {
  kind: LabelKind;
  value: number;
  index: number;
}

function scanLabels(text: string): LabelHit[] {
  const hits: LabelHit[] = [];
  const taken: [number, number][] = [];
  const overlaps = (a: number, b: number) => taken.some(([s, e]) => a < e && b > s);
  for (const { kind, pattern } of LABELS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const value = amountAfterLabel(text, end);
      if (value == null) continue;
      taken.push([start, end]);
      hits.push({ kind, value, index: start });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

function firstOf(hits: LabelHit[], kind: LabelKind): number | undefined {
  return hits.find((h) => h.kind === kind)?.value;
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

interface JsonLdFacts {
  name?: string;
  price?: number;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n >= 1_000 ? Math.round(n) : parseMoney(v);
  }
  return null;
}

function typeIs(node: Record<string, unknown>, ...names: string[]): boolean {
  const t = node["@type"];
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => typeof x === "string" && names.some((n) => x.toLowerCase().endsWith(n.toLowerCase())));
}

function walkJsonLd(node: unknown, out: JsonLdFacts, depth = 0): void {
  if (depth > 8 || node == null) return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) walkJsonLd(obj["@graph"], out, depth + 1);

  const isProductLike = typeIs(obj, "Product", "Offer", "AggregateOffer", "ListItem", "RealEstateListing", "SellAction");
  if (isProductLike || "offers" in obj) {
    if (out.name == null && typeof obj.name === "string" && obj.name.trim() && !typeIs(obj, "Offer", "AggregateOffer")) {
      out.name = cleanTitle(obj.name);
    }
    const currency = String(obj.priceCurrency ?? "").toUpperCase();
    if (out.price == null && (currency === "" || currency === "USD")) {
      const p = toNum(obj.price) ?? toNum(obj.lowPrice) ?? toNum(obj.highPrice);
      if (p != null) out.price = p;
      const spec = obj.priceSpecification as Record<string, unknown> | undefined;
      if (out.price == null && spec && typeof spec === "object") {
        const ps = toNum(spec.price);
        if (ps != null) out.price = ps;
      }
    }
    const offers = obj.offers;
    if (offers) walkJsonLd(offers, out, depth + 1);
    const item = obj.item;
    if (item) walkJsonLd(item, out, depth + 1);
  }
}

function extractJsonLd(html: string): JsonLdFacts {
  const out: JsonLdFacts = {};
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const body = m[1].trim().replace(/^<!--/, "").replace(/-->$/, "").replace(/^\s*\/\/<!\[CDATA\[/, "").replace(/\/\/\]\]>\s*$/, "");
    if (!body) continue;
    try {
      walkJsonLd(JSON.parse(body), out);
    } catch {
      // malformed JSON-LD is common; ignore the block
    }
    if (out.name && out.price) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

const STATE_NAME_RE = new RegExp(`\\b(${STATE_NAME_PATTERN})\\b`, "i");
/** Uppercase 2-letter code after a comma or at a boundary followed by a zip/end/punctuation. */
const STATE_CODE_RE = /(?:,\s*|\b)([A-Z]{2})(?=\s*(?:\d{5}(?:-\d{4})?)?\s*(?:[,.;)\n|]|$|\s(?:[A-Z]|\d|$)))/;

function findState(window: string): string | undefined {
  const nm = STATE_NAME_RE.exec(window);
  if (nm) return stateCode(nm[1]) ?? undefined;
  const re = new RegExp(STATE_CODE_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(window))) {
    const code = stateCode(m[1]);
    if (code) return code;
  }
  return undefined;
}

function metroBefore(window: string, stateIndex: number): string | undefined {
  const before = window.slice(0, stateIndex);
  const m = /([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\s*,?\s*$/.exec(before.replace(/\s+/g, " ").trimEnd());
  if (!m) return undefined;
  const metro = m[1].replace(/\s+(?:County|Area|Metro)$/i, "").trim();
  if (!metro || /^(?:Location|County|Metro|Area|City|State|Region|In|Near)$/i.test(metro)) return undefined;
  return metro.length > 60 ? undefined : metro;
}

function extractLocation(text: string): { state?: string; metro?: string } {
  const anchors = /\b(?:location|located\s+in|county|metro(?:politan)?(?:\s+area)?|area|region|city|state)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = anchors.exec(text))) {
    const anchor = m[0].toLowerCase();
    const isCounty = anchor === "county";
    const start = isCounty ? Math.max(0, m.index - 40) : m.index + m[0].length;
    const window = text.slice(start, (isCounty ? m.index : start) + 90).split("\n").slice(0, 2).join(" ");
    const state = findState(window);
    if (!state) continue;
    let metro: string | undefined;
    const sIdx = (() => {
      const nm = STATE_NAME_RE.exec(window);
      if (nm) return nm.index;
      const cm = new RegExp(STATE_CODE_RE.source).exec(window);
      return cm ? cm.index + (cm[0].length - 2) : -1;
    })();
    if (sIdx > 0) metro = metroBefore(window.replace(/^[\s:\-–—]*/, (p) => " ".repeat(p.length)), sIdx);
    return { state, metro };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Inventory / real estate flags
// ---------------------------------------------------------------------------

function flagAfterLabel(text: string, labelRe: RegExp): boolean | undefined {
  const re = new RegExp(labelRe.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const window = text.slice(m.index + m[0].length, m.index + m[0].length + 70).split("\n")[0] ?? "";
    if (/\b(?:not\s+included|excluded|leased|lease|rented|n\/a|none|no)\b/i.test(window)) return false;
    if (/\b(?:included|owned|yes|available\s+for\s+purchase)\b/i.test(window)) return true;
    const amt = amountAfterLabel(text, m.index + m[0].length);
    if (amt != null) {
      if (/\bnot\s+included\b/i.test(window)) return false;
      if (/\bincluded\b/i.test(window)) return true;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function extractListingFacts(html: string, url: string): ExtractedFacts {
  void url;
  const fields: ExtractedFacts["fields"] = {};
  const set = (key: string, value: unknown, source: FactSource) => {
    if (value === undefined || value === null || value === "") return;
    fields[key] = { value, source };
  };

  const ld = extractJsonLd(html);
  const ogTitle = metaContent(html, ["og:title", "twitter:title"]);
  const titleTag = (() => {
    const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
    return m ? cleanTitle(m[1]) : undefined;
  })();
  const text = htmlToText(html);
  const hits = scanLabels(text);

  // Title: JSON-LD name > og:title > <title>
  let title: string | undefined;
  let titleSource: FactSource = "none";
  if (ld.name) {
    title = ld.name;
    titleSource = "jsonld";
  } else if (ogTitle) {
    title = ogTitle;
    titleSource = "meta";
  } else if (titleTag) {
    title = titleTag;
    titleSource = "meta";
  }
  set("title", title, titleSource);

  // Asking price: JSON-LD price > labeled amount
  let askingPrice: number | undefined;
  if (ld.price != null) {
    askingPrice = ld.price;
    set("askingPrice", askingPrice, "jsonld");
  } else {
    askingPrice = firstOf(hits, "askingPrice");
    set("askingPrice", askingPrice, "label");
  }

  const revenue = firstOf(hits, "revenue");
  set("revenue", revenue, "label");

  const sde = firstOf(hits, "sde");
  const ebitda = firstOf(hits, "ebitda");
  const cashFlow = firstOf(hits, "seller_cash_flow");
  const netIncome = firstOf(hits, "net_income");
  set("sde", sde, "label");
  set("ebitda", ebitda, "label");
  set("cashFlow", cashFlow, "label");
  set("netIncome", netIncome, "label");

  // One earnings figure with its own type. Never converted between types.
  let earnings: number | undefined;
  let earningsType: ExtractedFacts["earningsType"];
  if (sde != null) {
    earnings = sde;
    earningsType = "sde";
  } else if (cashFlow != null) {
    earnings = cashFlow;
    earningsType = "seller_cash_flow";
  } else if (ebitda != null) {
    earnings = ebitda;
    earningsType = "ebitda";
  } else if (netIncome != null) {
    earnings = netIncome;
    earningsType = "unknown";
  }
  set("earnings", earnings, "label");
  set("earningsType", earningsType, earnings != null ? "label" : "none");

  const includesInventory = flagAfterLabel(text, /\binventory\b/);
  const includesRealEstate = flagAfterLabel(text, /\b(?:real\s+estate|real\s+property|building|property)\b/);
  set("includesInventory", includesInventory, "label");
  set("includesRealEstate", includesRealEstate, "label");

  const loc = extractLocation(text);
  set("state", loc.state, "label");
  set("metro", loc.metro, "label");

  // Industry guess: title first, then visible text; generic tags never stand alone.
  let industry: string | undefined;
  let industrySource: FactSource = "none";
  const fromTitle = title ? tagsInText(title).filter((t) => !GENERIC_TAGS.has(t)) : [];
  if (fromTitle.length) {
    industry = fromTitle[0];
    industrySource = titleSource;
  } else {
    const fromText = tagsInText(text.slice(0, 6000)).filter((t) => !GENERIC_TAGS.has(t));
    if (fromText.length) {
      industry = fromText[0];
      industrySource = "label";
    }
  }
  set("industry", industry, industrySource);

  const quality: ExtractedFacts["quality"] = askingPrice != null && (earnings != null || revenue != null) ? "high" : "low";

  const out: ExtractedFacts = { fields, quality };
  if (title) out.title = title;
  if (industry) out.industry = industry;
  if (loc.state) out.state = loc.state;
  if (loc.metro) out.metro = loc.metro;
  if (askingPrice != null) out.askingPrice = askingPrice;
  if (revenue != null) out.revenue = revenue;
  if (earnings != null) {
    out.earnings = earnings;
    out.earningsType = earningsType;
  }
  if (includesInventory !== undefined) out.includesInventory = includesInventory;
  if (includesRealEstate !== undefined) out.includesRealEstate = includesRealEstate;
  return out;
}
