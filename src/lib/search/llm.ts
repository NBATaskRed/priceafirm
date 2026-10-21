import "server-only";
import { z } from "zod";
import { emptyFilters, type SearchFilters } from "./types";
import { stateCode } from "@/lib/sources/usStates";

/**
 * Optional LLM interpretation of a Find deals query. Extracts filter INTENT only (what the buyer
 * is looking for); it never produces listing facts or crowd values. Returns null whenever the key
 * is missing, the call fails, times out, or the response is not valid JSON for SearchFilters.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";
const TIMEOUT_MS = 8_000;

const money = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  });

const strList = z
  .array(z.union([z.string(), z.null()]))
  .nullish()
  .transform((a) => (a ?? []).map((s) => (s ?? "").trim().toLowerCase()).filter(Boolean));

const LlmFilters = z.object({
  industries: strList,
  excludeIndustries: strList,
  states: strList,
  regions: strList,
  askMin: money,
  askMax: money,
  revenueMin: money,
  revenueMax: money,
  sdeMin: money,
  ebitdaMin: money,
  cashFlowMin: money,
  descriptors: strList,
});

const REGION_CANON: Record<string, string> = {
  southeast: "Southeast US",
  "southeast us": "Southeast US",
  northeast: "Northeast US",
  "northeast us": "Northeast US",
  midwest: "Midwest US",
  "midwest us": "Midwest US",
  southwest: "Southwest US",
  "southwest us": "Southwest US",
  west: "West US",
  "west us": "West US",
  "west coast": "West US",
  "south central": "South Central US",
  "south central us": "South Central US",
  "mountain west": "Mountain West",
  "pacific northwest": "Pacific Northwest",
  pnw: "Pacific Northwest",
};

const SYSTEM_PROMPT = `You convert a business buyer's free-text acquisition search into a JSON filter object. Return ONLY a single JSON object, no prose, no markdown fences.

Schema (all keys required; use [] or null when absent):
{
  "industries": string[],          // positive industry/sector keywords, lowercase, e.g. ["hvac","b2b services"]
  "excludeIndustries": string[],   // industries the buyer rules out, lowercase singular, e.g. ["restaurant"]
  "states": string[],              // US states as 2-letter codes, e.g. ["GA","FL"]
  "regions": string[],             // from: "Southeast US","Northeast US","Midwest US","Southwest US","West US","South Central US","Mountain West","Pacific Northwest"
  "askMin": number|null,           // asking price floor in USD
  "askMax": number|null,           // asking price ceiling in USD ("under $5M" => 5000000)
  "revenueMin": number|null,
  "revenueMax": number|null,
  "sdeMin": number|null,           // only when the buyer says SDE / seller's discretionary earnings
  "ebitdaMin": number|null,        // only when the buyer says EBITDA
  "cashFlowMin": number|null,      // generic cash flow / earnings / profit minimum
  "descriptors": string[]          // business-model preferences: "recurring","commercial customers","b2b","government contracts","franchise","absentee", etc.
}

Rules: extract only what the buyer asked for; never invent values; convert k/M/million to full USD integers; "at least"/"over"/"+" are minimums, "under"/"below"/"up to" are maximums; keep SDE and EBITDA separate and never convert one to the other; a plain money ceiling with no metric is askMax.`;

function normalize(parsed: z.infer<typeof LlmFilters>, raw: string): SearchFilters {
  const out = emptyFilters(raw);
  out.industries = Array.from(new Set(parsed.industries));
  out.excludeIndustries = Array.from(new Set(parsed.excludeIndustries));
  out.states = Array.from(new Set(parsed.states.map((s) => stateCode(s)).filter((s): s is string => Boolean(s))));
  out.regions = Array.from(new Set(parsed.regions.map((r) => REGION_CANON[r] ?? null).filter((r): r is string => Boolean(r))));
  out.descriptors = Array.from(new Set(parsed.descriptors));
  if (parsed.askMin != null) out.askMin = parsed.askMin;
  if (parsed.askMax != null) out.askMax = parsed.askMax;
  if (parsed.revenueMin != null) out.revenueMin = parsed.revenueMin;
  if (parsed.revenueMax != null) out.revenueMax = parsed.revenueMax;
  if (parsed.sdeMin != null) out.sdeMin = parsed.sdeMin;
  if (parsed.ebitdaMin != null) out.ebitdaMin = parsed.ebitdaMin;
  if (parsed.cashFlowMin != null) out.cashFlowMin = parsed.cashFlowMin;
  return out;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("no json");
  }
}

export async function parseSearchWithLlm(text: string): Promise<SearchFilters | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const raw = (text ?? "").trim();
  if (!apiKey || !raw) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: raw.slice(0, 2000) }],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const textOut = (body.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n");
    if (!textOut) return null;
    const parsed = LlmFilters.safeParse(extractJson(textOut));
    if (!parsed.success) return null;
    return normalize(parsed.data, raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
