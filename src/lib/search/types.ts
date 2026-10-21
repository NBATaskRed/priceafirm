/** Structured filter intent parsed from a free-text Find deals query (design Section 10). */
export interface SearchFilters {
  industries: string[];
  excludeIndustries: string[];
  /** 2-letter US state codes. */
  states: string[];
  /** Region labels as stored on listing_snapshots.region (e.g. "Southeast US"). */
  regions: string[];
  askMin?: number;
  askMax?: number;
  revenueMin?: number;
  revenueMax?: number;
  sdeMin?: number;
  ebitdaMin?: number;
  cashFlowMin?: number;
  /** Business-model words (recurring, b2b, franchise, absentee...). Soft preferences, not hard filters. */
  descriptors: string[];
  raw: string;
}

export function emptyFilters(raw = ""): SearchFilters {
  return { industries: [], excludeIndustries: [], states: [], regions: [], descriptors: [], raw };
}
