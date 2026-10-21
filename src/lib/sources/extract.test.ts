import { describe, expect, it } from "vitest";
import { extractListingFacts, htmlToText, parseMoney } from "./extract";

const URL = "https://example.com/listing/1";

const page = (body: string, head = "") => `<!doctype html><html><head><title>Site | Listing</title>${head}</head><body>${body}</body></html>`;

describe("parseMoney", () => {
  it("parses common listing money formats", () => {
    expect(parseMoney("$2,900,000")).toBe(2_900_000);
    expect(parseMoney("$3.2M")).toBe(3_200_000);
    expect(parseMoney("850K")).toBe(850_000);
    expect(parseMoney("1.2 million")).toBe(1_200_000);
    expect(parseMoney("$2.9MM")).toBe(2_900_000);
    expect(parseMoney("$ 450,000")).toBe(450_000);
    expect(parseMoney("USD 1,250,000")).toBe(1_250_000);
  });

  it("ignores bare numbers, percentages and tiny values", () => {
    expect(parseMoney("2019")).toBeNull();
    expect(parseMoney("35%")).toBeNull();
    expect(parseMoney("$12")).toBeNull();
    expect(parseMoney("Not disclosed")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("drops scripts and styles and collapses whitespace", () => {
    const t = htmlToText("<div>Asking   Price:</div><script>var x = '$9,999,999';</script><style>.a{}</style><p>$1,000,000</p>");
    expect(t).not.toContain("9,999,999");
    expect(t).toContain("Asking Price:");
    expect(t).toContain("$1,000,000");
  });
});

describe("extractListingFacts", () => {
  it("extracts labeled asking price, revenue and SDE", () => {
    const html = page(`
      <h1>Established HVAC Contractor</h1>
      <dl>
        <dt>Asking Price:</dt><dd>$2,900,000</dd>
        <dt>Gross Revenue:</dt><dd>$3.2M</dd>
        <dt>SDE:</dt><dd>850K</dd>
        <dt>Inventory:</dt><dd>$120,000 included</dd>
        <dt>Real Estate:</dt><dd>Leased</dd>
        <dt>Location:</dt><dd>Atlanta, GA</dd>
      </dl>`);
    const f = extractListingFacts(html, URL);
    expect(f.askingPrice).toBe(2_900_000);
    expect(f.revenue).toBe(3_200_000);
    expect(f.earnings).toBe(850_000);
    expect(f.earningsType).toBe("sde");
    expect(f.includesInventory).toBe(true);
    expect(f.includesRealEstate).toBe(false);
    expect(f.state).toBe("GA");
    expect(f.metro).toBe("Atlanta");
    expect(f.industry).toBe("hvac");
    expect(f.quality).toBe("high");
    expect(f.fields.askingPrice.source).toBe("label");
  });

  it("maps Cash Flow to seller_cash_flow and never converts it", () => {
    const f = extractListingFacts(page(`<p>Asking Price: $1,200,000</p><p>Cash Flow: $410,000</p><p>Revenue: $2,100,000</p>`), URL);
    expect(f.earnings).toBe(410_000);
    expect(f.earningsType).toBe("seller_cash_flow");
    expect(f.fields.ebitda).toBeUndefined();
    expect(f.fields.sde).toBeUndefined();
  });

  it("maps EBITDA to ebitda", () => {
    const f = extractListingFacts(page(`<table><tr><td>Price</td><td>$5,500,000</td></tr><tr><td>EBITDA</td><td>$1.1M</td></tr></table>`), URL);
    expect(f.askingPrice).toBe(5_500_000);
    expect(f.earnings).toBe(1_100_000);
    expect(f.earningsType).toBe("ebitda");
  });

  it("maps Seller's Discretionary Earnings to sde and prefers it over EBITDA when both appear", () => {
    const f = extractListingFacts(page(`<p>Seller's Discretionary Earnings: $600,000</p><p>EBITDA: $450,000</p>`), URL);
    expect(f.earnings).toBe(600_000);
    expect(f.earningsType).toBe("sde");
    expect(f.fields.ebitda.value).toBe(450_000);
  });

  it("uses JSON-LD price and name first", () => {
    const head = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Commercial Plumbing Company",
      offers: { "@type": "Offer", price: "1750000", priceCurrency: "USD" },
    })}</script><meta property="og:title" content="OG Title Here">`;
    const f = extractListingFacts(page(`<p>Asking Price: $1,800,000</p><p>Revenue: $4,000,000</p>`, head), URL);
    expect(f.title).toBe("Commercial Plumbing Company");
    expect(f.askingPrice).toBe(1_750_000);
    expect(f.fields.askingPrice.source).toBe("jsonld");
    expect(f.fields.title.source).toBe("jsonld");
    expect(f.industry).toBe("plumbing");
    expect(f.quality).toBe("high");
  });

  it("falls back to og:title for the title", () => {
    const f = extractListingFacts(page(`<p>nothing</p>`, `<meta property="og:title" content="Landscaping &amp; Lawn Care Business">`), URL);
    expect(f.title).toBe("Landscaping & Lawn Care Business");
    expect(f.fields.title.source).toBe("meta");
    expect(f.industry).toBe("landscaping");
    expect(f.quality).toBe("low");
  });

  it("detects a state from full names and from codes near location words", () => {
    expect(extractListingFacts(page(`<p>Location: Tampa Bay, Florida</p>`), URL).state).toBe("FL");
    expect(extractListingFacts(page(`<p>Located in Dallas, TX 75201</p>`), URL).state).toBe("TX");
    expect(extractListingFacts(page(`<p>Fulton County, Georgia</p>`), URL).state).toBe("GA");
    expect(extractListingFacts(page(`<p>Location: West Virginia</p>`), URL).state).toBe("WV");
  });

  it("does not store description text and handles undisclosed values", () => {
    const f = extractListingFacts(
      page(`<p>Asking Price: Not Disclosed</p><p>This wonderful company has served customers for 30 years and the owner is retiring.</p>`),
      URL,
    );
    expect(f.askingPrice).toBeUndefined();
    const stored = JSON.stringify(f);
    expect(stored).not.toContain("wonderful");
    expect(f.quality).toBe("low");
  });

  it("does not grab an amount from the next row", () => {
    const f = extractListingFacts(page(`<ul><li>Asking Price:</li><li>Revenue: $2,000,000</li></ul>`), URL);
    expect(f.askingPrice).toBeUndefined();
    expect(f.revenue).toBe(2_000_000);
  });
});
