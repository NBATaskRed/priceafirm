/** US state table shared by listing extraction and search parsing. Pure. */

export const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

export const STATE_CODES: string[] = Object.keys(US_STATES);

const NAME_TO_CODE: Record<string, string> = Object.fromEntries(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]));

/** Resolve a full state name or 2-letter code (any case) to its code; null when unknown. */
export function stateCode(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper.length === 2 && US_STATES[upper]) return upper;
  const lower = s.toLowerCase().replace(/\s+/g, " ");
  if (lower === "washington dc" || lower === "washington d.c." || lower === "d.c.") return "DC";
  return NAME_TO_CODE[lower] ?? null;
}

/** Regex alternation of full state names, longest first so "West Virginia" beats "Virginia". */
export const STATE_NAME_PATTERN: string = Object.values(US_STATES)
  .sort((a, b) => b.length - a.length)
  .map((n) => n.replace(/\s+/g, "\\s+"))
  .join("|");

export const REGIONS: Record<string, string[]> = {
  "Southeast US": ["AL", "FL", "GA", "KY", "MS", "NC", "SC", "TN", "VA", "WV"],
  "Northeast US": ["CT", "DE", "ME", "MD", "MA", "NH", "NJ", "NY", "PA", "RI", "VT", "DC"],
  "Midwest US": ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  "Southwest US": ["AZ", "NM", "NV"],
  "South Central US": ["TX", "OK", "AR", "LA"],
  "Mountain West": ["CO", "UT", "WY", "MT", "ID"],
  "Pacific Northwest": ["WA", "OR", "AK"],
  "West US": ["CA", "HI"],
};

const STATE_TO_REGION: Record<string, string> = {};
for (const [region, codes] of Object.entries(REGIONS)) for (const c of codes) STATE_TO_REGION[c] = region;

/** Region label for a 2-letter state code or full state name; null when unknown. */
export function regionForState(state: string): string | null {
  const code = stateCode(state);
  if (!code) return null;
  return STATE_TO_REGION[code] ?? null;
}
