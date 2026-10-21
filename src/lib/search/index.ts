import "server-only";
import { describeFilters } from "./apply";
import { parseSearchWithLlm } from "./llm";
import { parseSearchText } from "./parse";
import type { SearchFilters } from "./types";

export { applyFilters, describeFilters, matchesFilters } from "./apply";
export { parseSearchText } from "./parse";
export { parseSearchWithLlm } from "./llm";
export { emptyFilters, type SearchFilters } from "./types";

export interface InterpretedSearch {
  filters: SearchFilters;
  chips: string[];
  source: "llm" | "rules";
}

/** LLM result with rules filling anything the LLM left empty; rules alone when the LLM is unavailable. */
function merge(llm: SearchFilters, rules: SearchFilters): SearchFilters {
  const list = (a: string[], b: string[]) => (a.length ? a : b);
  const num = (a: number | undefined, b: number | undefined) => (a != null ? a : b);
  const out: SearchFilters = {
    industries: list(llm.industries, rules.industries),
    excludeIndustries: list(llm.excludeIndustries, rules.excludeIndustries),
    states: list(llm.states, rules.states),
    regions: list(llm.regions, rules.regions),
    descriptors: list(llm.descriptors, rules.descriptors),
    raw: rules.raw,
  };
  const askMin = num(llm.askMin, rules.askMin);
  const askMax = num(llm.askMax, rules.askMax);
  const revenueMin = num(llm.revenueMin, rules.revenueMin);
  const revenueMax = num(llm.revenueMax, rules.revenueMax);
  const sdeMin = num(llm.sdeMin, rules.sdeMin);
  const ebitdaMin = num(llm.ebitdaMin, rules.ebitdaMin);
  const cashFlowMin = num(llm.cashFlowMin, rules.cashFlowMin);
  if (askMin != null) out.askMin = askMin;
  if (askMax != null) out.askMax = askMax;
  if (revenueMin != null) out.revenueMin = revenueMin;
  if (revenueMax != null) out.revenueMax = revenueMax;
  if (sdeMin != null) out.sdeMin = sdeMin;
  if (ebitdaMin != null) out.ebitdaMin = ebitdaMin;
  if (cashFlowMin != null) out.cashFlowMin = cashFlowMin;
  return out;
}

export async function interpretSearch(text: string): Promise<InterpretedSearch> {
  const rules = parseSearchText(text);
  const llm = await parseSearchWithLlm(text);
  if (!llm) return { filters: rules, chips: describeFilters(rules), source: "rules" };
  const filters = merge(llm, rules);
  return { filters, chips: describeFilters(filters), source: "llm" };
}
