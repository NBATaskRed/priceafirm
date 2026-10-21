import { stateCode, STATE_NAME_PATTERN, US_STATES } from "@/lib/sources/usStates";
import { GENERIC_TAGS, INDUSTRY_TAGS, industryPattern, tagsInText } from "./industries";
import { emptyFilters, type SearchFilters } from "./types";

/**
 * Deterministic rules parser for Find deals queries. Pure, no network. The LLM parser (llm.ts) may
 * refine this, but every query must produce a usable filter set from these rules alone.
 */

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** "$5M", "$300,000", "5 million", "850k", "$2.5mm", "$300k+". Group 1 currency, 2 number, 3 suffix, 4 plus. */
const MONEY_TOKEN =
  /(\$|usd\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(million|mil|mm|m|thousand|k|bn|billion|b)?\b\s*(\+)?/gi;

interface MoneyToken {
  start: number;
  end: number;
  value: number;
  plus: boolean;
}

function moneyValue(num: string, suffix: string, hasCurrency: boolean): number | null {
  const suf = suffix.toLowerCase();
  const grouped = num.includes(",");
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  let mult = 1;
  if (suf === "k" || suf === "thousand") mult = 1_000;
  else if (suf === "m" || suf === "mm" || suf === "mil" || suf === "million") mult = 1_000_000;
  else if (suf === "b" || suf === "bn" || suf === "billion") mult = 1_000_000_000;
  // A bare number with no suffix, no grouping and no currency sign ("5 employees", "3 locations") is not money.
  if (!suf && !grouped && !hasCurrency) return null;
  const v = Math.round(n * mult);
  // "$5" or "$500" with nothing else is not a deal-sized amount.
  if (v < 1_000) return null;
  return v;
}

function findMoneyTokens(text: string): MoneyToken[] {
  const out: MoneyToken[] = [];
  const re = new RegExp(MONEY_TOKEN.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const matched = m[0];
    const plus = Boolean(m[4]);
    const coreLen = matched.replace(/\s*\+\s*$/, "").trimEnd().length;
    const coreEnd = m.index + coreLen;
    // Skip percentages ("35%").
    if (text[coreEnd] === "%") continue;
    const value = moneyValue(m[2], m[3] ?? "", Boolean(m[1]));
    if (value == null) continue;
    out.push({ start: m.index, end: plus ? m.index + matched.trimEnd().length : coreEnd, value, plus });
  }
  return out;
}

type Metric = "ask" | "revenue" | "sde" | "ebitda" | "cashflow";

const METRIC_PATTERNS: [Metric, RegExp][] = [
  ["sde", /seller'?s?\s+discretionary(?:\s+(?:earnings|income|cash\s*flow))?|discretionary\s+earnings|\bs\.?d\.?e\.?\b/i],
  ["ebitda", /\b(?:adjusted\s+|adj\.?\s+)?ebitda\b/i],
  ["cashflow", /cash\s*-?\s*flow|\bcf\b|owner'?s?\s+(?:benefit|earnings|income)|\bearnings\b|\bprofit(?:s|ability)?\b|net\s+income|bottom\s*line/i],
  ["revenue", /\brevenues?\b|\bsales\b|\bgross\b|top\s*-?\s*line|\bturnover\b|\breceipts\b|\bbillings?\b/i],
  ["ask", /\basking(?:\s+price)?\b|\bask\b|\bpriced?\b|\blist(?:ed|ing)?\s+(?:price|at|for)\b|purchase\s+price|\bvaluation\b|\bbudget\b|enterprise\s+value|\bev\b|deal\s+size|\bcost(?:ing)?\b|\bworth\b|ticket\s+size|\bsize\b/i],
];

const MAX_BEFORE = /(?:\b(?:under|below|beneath|less\s+than|lower\s+than|up\s+to|at\s+most|max(?:imum)?(?:\s+of)?|no\s+more\s+than|not\s+more\s+than|cheaper\s+than|capped\s+at|within|sub)\b|<=?)\s*(?:of\s+|about\s+|around\s+|roughly\s+|approximately\s+|~\s*)?[^$\d]{0,24}$/i;
const MIN_BEFORE = /(?:\b(?:at\s+least|min(?:imum)?(?:\s+of)?|over|above|more\s+than|greater\s+than|higher\s+than|exceed(?:s|ing)?|in\s+excess\s+of|upwards\s+of|north\s+of|starting\s+at|no\s+less\s+than|not\s+less\s+than)\b|>=?)\s*(?:of\s+|about\s+|around\s+|roughly\s+|approximately\s+|~\s*)?[^$\d]{0,24}$/i;
const MAX_AFTER = /^\s*(?:or\s+less|and\s+under|and\s+below|or\s+under|or\s+below|max(?:imum)?|cap|ceiling|tops)\b/i;
const MIN_AFTER = /^\s*(?:or\s+more|and\s+up|and\s+above|or\s+above|or\s+higher|or\s+greater|plus|min(?:imum)?|\+)/i;

/** Clause boundaries for context windows: punctuation and coordinating words. */
const BOUNDARY = /[,;.()]|\b(?:or|and|but|plus|also|preferably|ideally|with|while|whereas)\b/gi;

function windowBefore(text: string, start: number, prevEnd: number): string {
  const slice = text.slice(prevEnd, start);
  // Keep only the part after the last boundary.
  let lastBoundary = 0;
  const re = new RegExp(BOUNDARY.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice))) lastBoundary = m.index + m[0].length;
  return slice.slice(lastBoundary);
}

function windowAfter(text: string, end: number, nextStart: number): string {
  const slice = text.slice(end, nextStart);
  const re = new RegExp(BOUNDARY.source, "gi");
  const m = re.exec(slice);
  return m ? slice.slice(0, m.index) : slice;
}

function metricIn(s: string, fromEnd: boolean): { metric: Metric; distance: number } | null {
  let best: { metric: Metric; distance: number } | null = null;
  for (const [metric, re] of METRIC_PATTERNS) {
    const g = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(s))) {
      const distance = fromEnd ? s.length - (m.index + m[0].length) : m.index;
      if (!best || distance < best.distance) best = { metric, distance };
    }
  }
  return best;
}

interface Constraint {
  metric: Metric;
  min?: number;
  max?: number;
}

function assignMoney(filters: SearchFilters, c: Constraint): void {
  const setMin = (key: "askMin" | "revenueMin" | "sdeMin" | "ebitdaMin" | "cashFlowMin", v: number) => {
    filters[key] = filters[key] == null ? v : Math.min(filters[key]!, v);
  };
  const setMax = (key: "askMax" | "revenueMax", v: number) => {
    filters[key] = filters[key] == null ? v : Math.max(filters[key]!, v);
  };
  switch (c.metric) {
    case "ask":
      if (c.min != null) setMin("askMin", c.min);
      if (c.max != null) setMax("askMax", c.max);
      break;
    case "revenue":
      if (c.min != null) setMin("revenueMin", c.min);
      if (c.max != null) setMax("revenueMax", c.max);
      break;
    case "sde":
      if (c.min != null) setMin("sdeMin", c.min);
      break;
    case "ebitda":
      if (c.min != null) setMin("ebitdaMin", c.min);
      break;
    case "cashflow":
      if (c.min != null) setMin("cashFlowMin", c.min);
      break;
  }
}

function parseMoneyConstraints(text: string, filters: SearchFilters): void {
  const tokens = findMoneyTokens(text);
  if (!tokens.length) return;
  const consumed = new Set<number>();

  // Ranges: "between A and B", "A to B", "A - B", "from A to B".
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    const between = text.slice(a.end, b.start);
    if (!/^\s*(?:-|–|—|to|and|through|thru|up\s+to)\s*$/i.test(between)) continue;
    const beforeRaw = text.slice(i > 0 ? tokens[i - 1].end : 0, a.start);
    const isBetween = /\b(?:between|from)\s*$/i.test(beforeRaw.trimEnd());
    if (!isBetween && !/^\s*(?:-|–|—|to)\s*$/i.test(between)) continue;
    const lo = Math.min(a.value, b.value);
    const hi = Math.max(a.value, b.value);
    const before = windowBefore(text, a.start, i > 0 ? tokens[i - 1].end : 0).replace(/\b(?:between|from)\s*$/i, "");
    const after = windowAfter(text, b.end, i + 2 < tokens.length ? tokens[i + 2].start : text.length);
    const mAfter = metricIn(after, false);
    const mBefore = metricIn(before, true);
    const metric = (mAfter && (!mBefore || mAfter.distance <= mBefore.distance) ? mAfter : mBefore)?.metric ?? "ask";
    assignMoney(filters, { metric, min: lo, max: metric === "sde" || metric === "ebitda" || metric === "cashflow" ? undefined : hi });
    consumed.add(i);
    consumed.add(i + 1);
    i++;
  }

  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const t = tokens[i];
    const prevEnd = i > 0 ? tokens[i - 1].end : 0;
    const nextStart = i + 1 < tokens.length ? tokens[i + 1].start : text.length;
    const before = windowBefore(text, t.start, prevEnd);
    const after = windowAfter(text, t.end, nextStart);
    const rawAfter = text.slice(t.end, nextStart);

    let direction: "min" | "max" | null = null;
    if (t.plus || MIN_AFTER.test(rawAfter)) direction = "min";
    else if (MAX_AFTER.test(rawAfter)) direction = "max";
    else if (MAX_BEFORE.test(before)) direction = "max";
    else if (MIN_BEFORE.test(before)) direction = "min";

    // Strip comparator phrases before metric lookup so "over" / "under" are not mistaken for metrics.
    const mAfter = metricIn(after, false);
    const mBefore = metricIn(before, true);
    let metric: Metric | null = null;
    if (mAfter && mBefore) metric = mAfter.distance <= mBefore.distance ? mAfter.metric : mBefore.metric;
    else metric = (mAfter ?? mBefore)?.metric ?? null;

    if (!metric) {
      // No metric context: a ceiling is almost always a budget; a floor is ambiguous and ignored.
      if (direction === "max") assignMoney(filters, { metric: "ask", max: t.value });
      continue;
    }
    if (!direction) {
      direction = metric === "ask" ? "max" : "min";
    }
    assignMoney(filters, direction === "min" ? { metric, min: t.value } : { metric, max: t.value });
  }
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

const REGION_WORDS: [RegExp, string[]][] = [
  [/\b(?:south\s*-?\s*east(?:ern)?|se\s+us|the\s+southeast)\b/i, ["Southeast US"]],
  [/\b(?:north\s*-?\s*east(?:ern)?|new\s+england|mid\s*-?\s*atlantic|tri\s*-?\s*state)\b/i, ["Northeast US"]],
  [/\b(?:mid\s*-?\s*west(?:ern)?|great\s+lakes|rust\s+belt)\b/i, ["Midwest US"]],
  [/\b(?:south\s*-?\s*west(?:ern)?|desert\s+southwest)\b/i, ["Southwest US"]],
  [/\b(?:south\s+central|gulf\s+coast|gulf\s+south)\b/i, ["South Central US"]],
  [/\b(?:mountain\s+west|rockies|rocky\s+mountain(?:s)?|intermountain)\b/i, ["Mountain West"]],
  [/\b(?:pacific\s+north\s*-?\s*west|pnw)\b/i, ["Pacific Northwest"]],
  [/\b(?:west\s+coast|pacific\s+coast)\b/i, ["West US", "Pacific Northwest"]],
  [/\b(?:east\s+coast|eastern\s+seaboard)\b/i, ["Northeast US", "Southeast US"]],
  [/\b(?:the\s+south|southern\s+(?:us|states|united\s+states)|deep\s+south|sun\s*belt)\b/i, ["Southeast US", "South Central US"]],
  [/\b(?:the\s+west|western\s+(?:us|states|united\s+states)|out\s+west)\b/i, ["West US", "Mountain West", "Pacific Northwest", "Southwest US"]],
];

const STATE_NAME_RE = new RegExp(`\\b(${STATE_NAME_PATTERN})\\b`, "gi");
const LOWER_CODE_STOPWORDS = new Set(["in", "or", "me", "ok", "hi", "de", "co", "al", "id", "oh", "ma", "mo", "pa", "la", "wa", "ga"]);

function parseGeography(original: string, lower: string, filters: SearchFilters): void {
  const states = new Set<string>();
  const regions = new Set<string>();

  let m: RegExpExecArray | null;
  const nameRe = new RegExp(STATE_NAME_RE.source, "gi");
  while ((m = nameRe.exec(lower))) {
    // "Washington DC" is the district, not the state; "New York City" still means NY.
    if (/^washington$/i.test(m[1]) && /^\s*,?\s*(?:d\.?c\.?)\b/i.test(lower.slice(m.index + m[0].length))) {
      states.add("DC");
      continue;
    }
    const code = stateCode(m[1]);
    if (code) states.add(code);
  }

  // Uppercase 2-letter codes in the original text (GA, FL), unless the whole text is shouting.
  const allCaps = original === original.toUpperCase() && /[A-Z]/.test(original);
  if (!allCaps) {
    const codeRe = /(?<![A-Za-z$])([A-Z]{2})(?![A-Za-z])/g;
    while ((m = codeRe.exec(original))) {
      const c = m[1];
      if (c === "US" || c === "EV" || c === "CF" || c === "IT" || c === "OR" || c === "IN" || c === "OK" || c === "HI" || c === "ME") {
        // Ambiguous English words / acronyms: accept only in a list context ("GA or IN", "IN, OH").
        const ctx = original.slice(Math.max(0, m.index - 6), m.index + 8);
        if (!/(?:,|\/|\bor\b|\band\b|&)\s*[A-Z]{2}\b|\b[A-Z]{2}\s*(?:,|\/|\bor\b|\band\b|&)/.test(ctx)) continue;
        if (c === "US" || c === "EV" || c === "CF" || c === "IT") continue;
      }
      if (US_STATES[c]) states.add(c);
    }
  }

  // Lowercase codes in explicit list or "in xx" context: "ga or fl", "tx, fl", "in ga".
  const listRe = /\b([a-z]{2})(?:\s*(?:,|\/|or|and|&)\s*([a-z]{2}))+\b/g;
  while ((m = listRe.exec(lower))) {
    const parts = m[0].split(/\s*(?:,|\/|\bor\b|\band\b|&)\s*/).filter(Boolean);
    const codes = parts.map((p) => (US_STATES[p.toUpperCase()] ? p.toUpperCase() : null));
    if (codes.every((c) => c != null) && parts.filter((p) => LOWER_CODE_STOPWORDS.has(p)).length <= parts.length - 1 && parts.some((p) => !LOWER_CODE_STOPWORDS.has(p))) {
      for (const c of codes) if (c) states.add(c);
    }
  }
  const inRe = /\bin\s+([a-z]{2})\b(?!\s*[a-z])/g;
  while ((m = inRe.exec(lower))) {
    const p = m[1];
    if (!LOWER_CODE_STOPWORDS.has(p) && US_STATES[p.toUpperCase()]) states.add(p.toUpperCase());
  }

  for (const [re, regs] of REGION_WORDS) {
    if (re.test(lower)) for (const r of regs) regions.add(r);
  }

  filters.states = Array.from(states).sort();
  filters.regions = Array.from(regions);
}

// ---------------------------------------------------------------------------
// Industries, exclusions, descriptors
// ---------------------------------------------------------------------------

const EXCLUSION_RE =
  /\b(?:exclude|excluding|except(?:\s+for)?|other\s+than|without|avoid(?:ing)?|skip(?:ping)?|no|not|don'?t\s+want|do\s+not\s+want|nothing\s+in|minus|besides|outside\s+of|aside\s+from)\b/gi;

const MODEL_TAGS = new Set(["b2b", "b2c", "recurring", "services"]);

/** Find exclusion spans: text after an exclusion word up to a clause boundary. */
function exclusionSpans(lower: string): [number, number][] {
  const spans: [number, number][] = [];
  const re = new RegExp(EXCLUSION_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) {
    const start = m.index + m[0].length;
    const rest = lower.slice(start);
    // "no more than", "not more than", "not less than", "no less than" are comparators, not exclusions.
    if (/^\s*(?:more|less|fewer|greater|lower|higher|later|earlier|only|just|too|very|so)\b/.test(rest)) continue;
    const endMatch = /[,;.]|\b(?:but|however|with|preferably|ideally|under|over|above|below|at\s+least|up\s+to|in\b)/.exec(rest);
    const end = start + (endMatch ? endMatch.index : rest.length);
    if (end > start) spans.push([start, end]);
  }
  return spans;
}

function blank(text: string, spans: [number, number][]): string {
  let out = text;
  for (const [s, e] of spans) out = out.slice(0, s) + " ".repeat(e - s) + out.slice(e);
  return out;
}

const DESCRIPTOR_PATTERNS: [string, RegExp][] = [
  ["recurring", /\b(?:recurring|subscription|re-?occurring|repeat\s+(?:business|customers)|contract(?:ed|ual)?\s+(?:revenue|income|work)|service\s+contracts?|maintenance\s+contracts?|route(?:\s+business)?)\b/i],
  ["commercial customers", /\bcommercial\s+(?:customers?|clients?|accounts?|base|focus)|\bcommercial\b/i],
  ["b2b", /\bb2b\b|business\s*-?\s*to\s*-?\s*business/i],
  ["b2c", /\bb2c\b|business\s*-?\s*to\s*-?\s*consumer/i],
  ["government contracts", /\b(?:government|gov'?t|federal|municipal|state)\s+(?:contracts?|work|customers?|clients?)|\bgsa\b|\bdod\b|\bgovcon\b/i],
  ["franchise", /\bfranchis(?:e|es|ed|or|ee)\b/i],
  ["absentee", /\babsentee(?:\s*-?\s*(?:owned|owner|run))?\b|\bpassive(?:\s+income)?\b|\bhands\s*-?\s*off\b/i],
  ["owner-operated", /\bowner\s*-?\s*operat(?:ed|or)\b/i],
  ["management in place", /\bmanagement\s+in\s+place\b|\bmanager\s+in\s+place\b|\bgm\s+in\s+place\b/i],
  ["relocatable", /\brelocatable\b|\bcan\s+be\s+relocated\b/i],
  ["home-based", /\bhome\s*-?\s*based\b|\bwork\s+from\s+home\b/i],
  ["seller financing", /\bseller\s+financ(?:ing|ed)\b|\bowner\s+financ(?:ing|ed)\b|\bsba\s*(?:eligible|pre-?qualified|financ(?:ing|eable))?\b/i],
  ["real estate included", /\breal\s+estate\s+included\b|\bwith\s+(?:the\s+)?(?:real\s+estate|building|property)\b|\bowns?\s+(?:the\s+)?(?:building|real\s+estate)\b/i],
  ["established", /\bestablished\b|\blong\s*-?\s*standing\b|\b\d{2}\+?\s*years?\s+in\s+business\b/i],
  ["growing", /\bgrowing\b|\bgrowth\b|\bexpanding\b/i],
];

/** Split an exclusion clause into its listed items: "pool and cleaning" -> ["pool", "cleaning"]. */
function exclusionItems(clause: string): string[] {
  return clause
    .split(/\s*(?:,|\/|\bor\b|\band\b|&|\bnor\b)\s*/)
    .map((s) => s.replace(/\b(?:any|anything|all|the|a|an|businesses|business|companies|company|firms|shops|deals|listings)\b/g, " ").replace(/\s+/g, " ").trim())
    .map((s) => s.replace(/(?<=[a-z])s$/, (m, off, str) => (/(?:ss|us|is)$/.test(str) ? m : "")))
    .filter((s) => s.length >= 3);
}

function parseIndustries(lower: string, filters: SearchFilters): void {
  const spans = exclusionSpans(lower);
  const positiveText = blank(lower, spans);
  const positiveTags = new Set(tagsInText(positiveText));
  const excluded = new Set<string>();
  for (const [s, e] of spans) {
    const clause = lower.slice(s, e);
    const tags = tagsInText(clause).filter((t) => !MODEL_TAGS.has(t));
    for (const tag of tags) {
      // "home services ... exclude pool and cleaning": the clause's tag is also the positive industry, so the buyer
      // means the specific words, not the whole category. Keep the literal items instead.
      if (positiveTags.has(tag)) continue;
      excluded.add(tag);
    }
    // Items that map to no dictionary tag ("bars", "pool") are kept literally so apply.ts can match them in text.
    for (const item of exclusionItems(clause)) {
      const itemTags = tagsInText(item).filter((t) => !MODEL_TAGS.has(t));
      if (itemTags.some((t) => !positiveTags.has(t))) continue; // already covered by a tag above
      if (/^(?:more|less|than|only|just|too|very|so|much|many)\b/.test(item)) continue;
      excluded.add(item);
    }
  }
  const positives: string[] = [];
  for (const tag of INDUSTRY_TAGS) {
    if (excluded.has(tag)) continue;
    if (tag === "recurring") continue; // business-model word: descriptor, never a hard industry filter
    const re = industryPattern(tag);
    if (!re) continue;
    if (tag === "services") {
      // "services" alone is too generic to be a hard filter; keep it only when paired with a specific tag in text
      // such as "b2b services" or "home services" (the latter is its own tag).
      if (!/\bb2b\s+services?\b|\bcommercial\s+services?\b|\bbusiness\s+services?\b|\bprofessional\s+services?\b/i.test(positiveText)) continue;
    }
    if (re.test(positiveText)) positives.push(tag);
  }
  // "B2B services" is one combined term (b2b AND services) rather than two tags. "B2B businesses" stays plain b2b so
  // a B2B manufacturer or distributor still qualifies.
  if (/\bb2b\s+services?\b/.test(positiveText)) {
    const rest = positives.filter((t) => t !== "b2b" && t !== "services");
    filters.industries = ["b2b services", ...rest];
  } else {
    filters.industries = positives;
  }
  filters.excludeIndustries = Array.from(excluded);

  const descriptors: string[] = [];
  for (const [name, re] of DESCRIPTOR_PATTERNS) {
    if (re.test(positiveText)) descriptors.push(name);
  }
  // Keep "b2b"/"b2c" as both a hard industry tag and a descriptor only when the industry list has nothing else;
  // otherwise it reads as a model preference. Deduplicate generic overlap.
  filters.descriptors = Array.from(new Set(descriptors));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function parseSearchText(text: string): SearchFilters {
  const raw = (text ?? "").trim();
  const filters = emptyFilters(raw);
  if (!raw) return filters;
  const original = raw.replace(/\s+/g, " ");
  const lower = original.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  parseGeography(original, lower, filters);
  parseIndustries(lower, filters);
  parseMoneyConstraints(lower, filters);

  // Sanity: a min above a max for the same metric is a parse error; keep the max.
  if (filters.askMin != null && filters.askMax != null && filters.askMin > filters.askMax) delete filters.askMin;
  if (filters.revenueMin != null && filters.revenueMax != null && filters.revenueMin > filters.revenueMax) delete filters.revenueMin;

  return filters;
}

export { GENERIC_TAGS };
