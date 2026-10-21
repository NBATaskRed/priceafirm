/**
 * Industry keyword dictionary shared by search parsing, filter application and listing extraction.
 * Pure. Keys are canonical tags stored in listing_snapshots.industry_tags and SearchFilters.industries.
 */

export const INDUSTRY_SYNONYMS: Record<string, string[]> = {
  hvac: ["hvac", "heating and air", "heating & air", "air conditioning", "heating and cooling", "heating, ventilation", "mechanical contractor"],
  plumbing: ["plumbing", "plumber"],
  electrical: ["electrical", "electrician", "electrical contractor", "electric contractor"],
  landscaping: ["landscaping", "landscape", "landscaper", "lawn care", "lawn maintenance", "tree service", "irrigation"],
  logistics: ["logistics", "freight", "3pl", "warehousing", "supply chain", "courier", "last mile", "last-mile"],
  trucking: ["trucking", "truckload", "hauling", "transportation", "transport company"],
  manufacturing: ["manufacturing", "manufacturer", "fabrication", "fabricator", "machine shop", "machining", "cnc", "precision machining", "injection molding"],
  software: ["software", "tech company", "it services", "it service", "managed services", "msp", "technology company"],
  saas: ["saas", "software as a service", "software-as-a-service", "subscription software"],
  b2b: ["b2b", "business to business", "business-to-business", "commercial accounts", "commercial customers", "commercial clients", "commercial"],
  b2c: ["b2c", "business to consumer", "business-to-consumer", "consumer"],
  restaurant: ["restaurant", "cafe", "coffee shop", "pizzeria", "food service", "foodservice", "bakery", "diner", "eatery", "qsr", "fast food", "fast casual", "bar and grill", "sports bar"],
  retail: ["retail", "retailer", "storefront", "boutique", "convenience store", "liquor store"],
  healthcare: ["healthcare", "health care", "medical", "clinic", "home health", "physical therapy", "pharmacy", "medical practice", "urgent care", "behavioral health"],
  dental: ["dental", "dentist", "dentistry", "orthodontic", "orthodontist"],
  "home services": ["home services", "home service", "residential services", "roofing", "roofer", "pest control", "cleaning", "painting", "garage door", "pool service", "handyman", "restoration", "flooring", "window cleaning", "gutter"],
  staffing: ["staffing", "recruiting", "recruitment", "temp agency", "employment agency", "staffing agency"],
  distribution: ["distribution", "distributor", "wholesale", "wholesaler"],
  "e-commerce": ["e-commerce", "ecommerce", "e commerce", "online store", "online retail", "amazon fba", "fba", "shopify", "online business"],
  construction: ["construction", "general contractor", "contractor", "builder", "remodeling", "concrete", "paving", "excavation", "demolition", "specialty trade"],
  maintenance: ["maintenance", "facility services", "facilities services", "facilities maintenance", "janitorial"],
  industrial: ["industrial", "industrial services", "equipment rental", "machinery", "industrial supply"],
  automotive: ["automotive", "auto repair", "auto body", "collision", "car wash", "tire shop", "auto shop", "dealership"],
  insurance: ["insurance agency", "insurance"],
  accounting: ["accounting", "cpa firm", "bookkeeping", "tax preparation", "tax practice"],
  marketing: ["marketing agency", "marketing", "advertising agency", "digital agency"],
  education: ["education", "school", "tutoring", "childcare", "daycare", "day care", "preschool"],
  fitness: ["fitness", "gym", "yoga studio", "martial arts"],
  security: ["security company", "security services", "alarm company", "security"],
  printing: ["printing", "print shop", "signs", "signage"],
  services: ["services", "service business", "service company", "service"],
  recurring: ["recurring", "recurring revenue", "subscription", "route business", "service contracts", "maintenance contracts", "contract revenue"],
};

export const INDUSTRY_TAGS: string[] = Object.keys(INDUSTRY_SYNONYMS);

/** Tags too generic to stand alone as a listing's industry. */
export const GENERIC_TAGS = new Set(["b2b", "b2c", "services", "recurring"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS: Record<string, RegExp> = Object.fromEntries(
  Object.entries(INDUSTRY_SYNONYMS).map(([tag, syns]) => {
    const alts = [...syns].sort((a, b) => b.length - a.length).map((s) => escapeRe(s).replace(/\s+/g, "[\\s-]+"));
    return [tag, new RegExp(`(?<![a-z0-9-])(?:${alts.join("|")})(?:e?s)?(?![a-z0-9])`, "i")];
  }),
);

/** Regex that matches any synonym of a tag (with simple plurals), case-insensitive. */
export function industryPattern(tag: string): RegExp | null {
  return PATTERNS[tag] ?? null;
}

/** All dictionary tags whose synonyms occur in the text, in dictionary order. */
export function tagsInText(text: string): string[] {
  const out: string[] = [];
  for (const tag of INDUSTRY_TAGS) {
    if (PATTERNS[tag].test(text)) out.push(tag);
  }
  return out;
}

/**
 * Expand a free-text industry term (from a user, the LLM or a stored tag) into the set of dictionary
 * tags it refers to. "industrial maintenance" -> ["industrial", "maintenance"]; unknown words are kept
 * as their own lowercase tag so they can still be matched literally against industry text.
 */
export function expandIndustryTerm(term: string): string[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  if (INDUSTRY_SYNONYMS[t]) return [t];
  const tags = tagsInText(t);
  if (tags.length) return tags;
  return [t];
}

/** Display label for a tag: acronyms upper-cased, otherwise sentence case. */
export function industryLabel(tag: string): string {
  const t = tag.trim();
  const ACR: Record<string, string> = { hvac: "HVAC", b2b: "B2B", b2c: "B2C", saas: "SaaS", "e-commerce": "E-commerce", msp: "MSP", "3pl": "3PL", it: "IT" };
  return t
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (ACR[lower]) return ACR[lower];
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}
