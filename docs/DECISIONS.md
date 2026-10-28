# Owner decisions log (Ashish Bhatt)

Newest at the bottom. Either tool appends a line when the owner decides something. Format: date, decision, where it lives.

- 2026-10-21: Build on the same stack as fundstamp.com (Next.js, Vercel, Supabase). README, CLAUDE.md.
- 2026-10-21: No minimum-count privacy suppression; every valued listing shows the number of independent valuations behind it. DESIGN 5.3.
- 2026-10-21: Design v2.2: operator (NBA/Synergy) listings first; third-party listings ingested without prior permission, removed on complaint; BizBuySell excluded; model prior blended with ask; asking price always treated as EV; proper confidence scoring with caps by coverage only; URL reveal free below 3 valuations, 1 point at 3+; Find Deals rows identifiable and exposed on render; newcomer loss floor -3 over first 5 forecasts; no house valuations. DESIGN.
- 2026-10-22: Buyers get an automated valuation request after 1 to 2 weeks with materials: another system sends name, email, listing URL; accounts are auto-created; the email link auto-logs in and opens the valuation form; later login by email link or optional password. DESIGN 13, INVITE_API.md.
- 2026-10-22: Listings in requests are identified by URL; a new URL is onboarded first. The same buyer can appear for many listings (one account).
- 2026-10-22: The buyer's own valuation counts toward the 3-valuation reveal threshold (proposal to exclude it was rejected).
- 2026-10-22: Points from a valuation update every time another independent buyer values the same listing. DESIGN 6.4.
- 2026-10-22/28: Scoring must be mathematically incentive-compatible for both the number and the confidence level: quadratic proper score, no clipping (replaced the clipped log score, which rewarded shading toward the crowd). DESIGN 6.3, model.test.ts.
- 2026-10-22: Keep the newcomer floor despite its small pull toward High on the first 5 forecasts.
- 2026-10-22: UX must be great, simple and fun; design done on a Claude Design canvas. UX_SPEC.md, docs/design/.
- 2026-10-28: UX spec approved: Hanken Grotesk + Archivo wide; wording; valuation form with live value band. Light theme default, dark theme optional. UX_SPEC.md v1.1.
- 2026-10-28: Development may move mostly to ChatGPT/Codex; Claude keeps scoring, product design and UX design. WORKFLOW.md.
