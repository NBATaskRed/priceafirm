# PriceAFirm — Complete MVP Product Design and Decision Rationale

> Repo copy of the spec of record (Project doc `claude/PriceAFirm_Product_Design_v2.2.md`, now at v2.3). Keep both in sync.

**Version:** 2.3 (October 22, 2026: automated buyer valuation requests with auto-created accounts and auto-login links; listings identified by URL and onboarded on first request; password or email-link sign-in. Builds on 2.2, revised per Ashish's decisions of October 21, 2026: operator listings and buyer invites for cold start; permissionless third-party ingestion with removal on complaint; model prior; incentive-compatible confidence scoring; URL reveals free below 3 valuations; simplified Find Deals; ask always treated as EV; newcomer loss floor; owner-side-ready schema)  
**Date:** October 22, 2026  
**Status:** Build specification for an invited-user pilot, with explicitly flagged experimental scoring and statistical assumptions  
**Website:** PriceAFirm.com (domain available; register it; trademark clearance not established)

> **Product in one sentence:** PriceAFirm converts independent, confidence-labeled acquisition valuations of businesses *already listed for sale* into probabilistic crowd intelligence, and rewards useful contributions with a dynamically recalculated point balance that buyers spend to reveal original listing URLs on well-evidenced deals.

> **Scientific constraint:** In the absence of actual sale prices or other independent ground truth, disagreement with subsequent forecasters is **not proof of inaccuracy or disinformation**. The signed score measures predictive usefulness relative to *later independent judgments*, using assumptions to be tested. The interface must not claim verified accuracy until such validation exists. An outcome-based (sale price) scoring channel is **out of scope** for MVP.

---

## 1. Executive summary and locked decisions

| Area | MVP decision | Reason |
|---|---|---|
| Universe | Businesses listed for sale: the operator's own NBA/Synergy listings first, then public listing pages on broker sites, ingested **without prior permission** and **removed on complaint**; BizBuySell excluded | Real inventory from day one without a partner program |
| Cold start | Buyers who have had an operator listing's materials for **1 to 2 weeks** receive an **automated valuation request**: the buyer-qualification system sends PriceAFirm the buyer's name, email and the listing URL; PriceAFirm onboards the listing if new, **creates the account automatically**, and emails a link that **signs the buyer in and opens that listing's valuation form**; **no house valuations** | The operator already has a stream of qualified buyers looking at each deal; zero-friction entry converts them |
| Economic question | Standardized cash-free/debt-free enterprise value (EV); **every asking price is treated as EV** (equity vs. asset basis is never known and never asked) | Makes independent values comparable without an unanswerable data field |
| Listing updates | Freeze each imported snapshot and asking price; no automated refresh required in MVP | Avoids changing the question underneath participants |
| Input | **One central valuation plus Low / Medium / High confidence**; implied multiple shown live | Fast, intuitive, and no false requirement to articulate a full subjective PDF |
| Derived distributions | The platform converts the central value and confidence into a clearly labeled **assumed** lognormal kernel | Retains uncertainty in aggregation without claiming the user supplied a PDF |
| Crowd model | Conservative, dependence-aware opinion pool over a **model prior** (industry multiple × earnings, blended with the ask) | Avoids fictitious precision; generalizes to businesses with no ask |
| Evidence count | **Every valued listing displays the number of independent valuations** behind its crowd figure; **numeric figures always shown**, no bands, no minimum count | Lets users weigh a crowd figure by how much evidence stands behind it |
| Trading | **None**: no portfolios, shares, market makers, or auctions | Static listing values do not need manufactured liquidity |
| Points | **One live signed balance**; starts at **3 points**; real-time additions, deductions, and URL-reveal charges | Simple, legible economics, including legitimate negative balances |
| Valuation scoring | **Proper (log) score** of the submitted kernel against later independent reports, relative to the crowd before it; **gain/loss caps depend only on prior coverage**, never on confidence | Honest confidence is the best strategy; High earns and loses more only through its narrower kernel |
| Newcomer floor | Across a user's **first 5** scored forecasts, cumulative posted loss is floored at **−3** (the signup grant) | Prevents bait-and-switch feel in a small cohort |
| Score revaluation | Every later qualified independent forecast recalculates earlier forecasts' points; post *delta* immediately | Early work can gain or lose value as information arrives |
| Main player route | **Value businesses:** neutral company metadata + independent valuation count + possible points; sort by **maximum points available** | Directs contributors to the highest-reward forecasts without leaking crowd value |
| Buyer route | **Find deals:** free natural-language search over **identifiable listings** with numeric crowd figures and counts; **any listing rendered there is exposed** and forfeits scored valuation | Simplest design that keeps blind elicitation honest |
| Paid action | URL reveal is **free while a listing has fewer than 3 independent valuations**; **1 point** at 3 or more; repeated opens free | Price attaches to crowd-informed access, not to a URL anyone can find |
| User-submitted deals | Submit any public broker listing URL (except excluded sites), parse facts, and **immediately offer valuation plus confidence and point range** | Captures judgments from buyers' normal deal-review workflow |
| Reputation | Private, provisional peer-predictive **skill percentile**, after enough scored observations; no public leaderboard; opt-in **verified valuer** status later | Competitive feedback without falsely asserting known truth |
| Sign-in | Email link at any time, or an optional password the buyer sets in Account; the emailed valuation link signs the buyer in automatically for 30 days | No signup step for invited buyers; no password required |
| Confidentiality | No participant identities or individual forecasts displayed to other users, buyers, or brokers; no confidential/NDA-restricted information except where the operator's own NDA permits a valuation submission | Protects owners and participants |
| Pilot | 30–50 invited buyers; operator listings first, third-party broker listings next | Tests viability under infrequent participation |

### What is intentionally absent

No share transactions, no price-changing market maker, no simulated cash portfolio, no bought/sold positions, no public user ranking, no live private-company feed, no automated comparison-database licensing, no NDA document upload, no confidential owner-led valuation portal, no minimum-count suppression of crowd figures, no house (operator-authored) valuations, no broker permission workflow, no participation credit for merely submitting a forecast, no sale-price outcome channel, and no promise that a model-derived crowd value is an executable business acquisition bid.

### The principal user loop

1. Receive **3 points** on an account PriceAFirm created for you. Most users arrive through an automated valuation request about an operator listing whose materials they have had for 1 to 2 weeks; its link signs them in and opens straight to that listing's valuation form. Later sign-ins use an email link or an optional password.
2. Choose **Value businesses** to find relevant opportunities, sortable by **maximum possible points** (no crowd-value signal visible; the number of independent valuations already on file is shown).
3. Enter a **central EV estimate** (implied multiple shown) and **Low / Medium / High confidence** after seeing the frozen listing facts; the possible signed point range is shown beforehand and is the same for every confidence level.
4. Receive a saved score (initially 0 if there is no independent subsequent evidence); as other qualified users value the business, previous contributions are recalculated and the **single available balance** adjusts up or down.
5. Choose **Find deals** to search for undervalued acquisition opportunities. Results are identifiable listings with numeric crowd figures and the count behind each. Reveal the source URL **free** on listings with fewer than 3 valuations, **1 point** at 3 or more.
6. Submit promising deals they encounter elsewhere by entering a **public broker listing URL**, adding new opportunities and their own blind opinions.

---

## 2. The product's underlying economics and design principles

**The valuable asset is independently elicited valuation judgment**, not simulated trading. A listing's static snapshot defines a common question; acquisition professionals supply estimates based on their own knowledge and expertise. Their collective opinions are useful for screening deals, but they are neither binding offers nor observed prices.

Design principles:

- **One judgment in seconds:** Do not require probability distributions, explicit P10/P90 bounds, justifications, or trading schedules from ordinary users.
- **Honest confidence is the best strategy:** Scoring is a proper scoring rule applied to the kernel the user selected, with caps that do not depend on the selection. Overstating confidence has negative expected points.
- **No free points for showing up:** A forecast earns nothing until later independent evidence arrives. There is no participation credit, because that would pay for low-quality numbers.
- **Do not confuse private forecasts with public facts:** Each user's valuation is confidential to the platform. Only aggregate results appear to other users, always with the number of independent valuations behind them.
- **Evidence is counted, never hidden:** Numeric crowd figures are shown at any count, with the count.
- **Simplicity in interface, rigor in bookkeeping:** One visible balance; an immutable event ledger underneath; hidden scoring/permissions complexity.
- **No minimum liquidity requirement:** One forecast still has informational value and is shown with its count; a deal can sit for months without new reports and the platform continues working.
- **Ask is EV, by rule:** The platform never asks what an asking price represents. Buyers fold any basis judgment into their own estimate.

---

## 3. Canonical listing and valuation question

Each listing is one **immutable snapshot** identified by a platform listing ID and snapshot version. All participants value the same public information set, not a continuously changing real business.

**Question shown to user:**

> “Based on this listing snapshot dated [date], what is your best estimate of the business's **cash-free, debt-free enterprise value**, under the transaction assumptions stated below? Give your central estimate, then how confident you are.”

Fields to store, with explicit `unknown` where necessary:

- Source URL, source type (operator / third-party), publisher/broker, extraction timestamp, provenance for every reused field, complaint/removal state.
- Industry classification and semantic tags; metropolitan area/state/region; business size metrics. Factual fields only; no authored descriptions or photos copied from third-party pages.
- Asking price and currency, **treated as EV**; revenue and period; earnings value and clearly labeled **SDE, EBITDA, seller cash flow, or unknown**.
- Whether inventory, operating net working capital (NWC), and real estate are stated as included; special disclosed deal terms, with overrides.
- Snapshot effective date, content hash, approval state and listing-status flags. No continuous financial updates during the MVP.

**Working-capital convention carried forward:** If reported annual cash flow is **below $1 million**, assume normalized NWC **excluded**; at **$1 million or above**, assume normalized NWC **included**. Explicit deal terms override; unknown cash flow leaves NWC convention unresolved. Inventory is a separate issue; real estate excluded unless specified.

**Ask-basis convention:** The asking price is EV for every calculation (prior, crowd/ask ratio, `Pr(EV > ask)`). The UI states this once in the valuation terms. There is no price-basis field, no basis-compatibility check, and no suppressed ratio.

MVP policy: **Assume the business facts and ask have not changed** since import. Show the snapshot date and explain this is a modeling convention, not a guarantee about business operations. Future price changes create a *new snapshot version*; they do not retroactively change what earlier people were asked to value.

---

## 4. Forecast submission: single number plus confidence

### 4.1 Why this wins over requiring a PDF or range

Requiring full subjective distributions risks eliciting invented precision. A low-friction point estimate is likely closer to the actual information a professional has after reading a listing. The confidence question is easy to answer, increases perceived agency, and lets the scoring rule reward calibration.

**Recommended default form** (one screen):

```text
  PRICEAFIRM                         Points: 3.0
  ------------------------------------------------
  HVAC Services | Southeast US | $3.2M revenue
  Annual cash flow: $680K (SDE) | Asking: $2.9M
  Snapshot: Oct 2026 | Valuation basis: [See terms]
  Independent valuations on file: 2

  What is your best estimate of enterprise value?
  [ $ 2,650,000                  ]   = 3.9x SDE

  How confident are you in that estimate?
  ( ) Low       (●) Medium       ( ) High
  Medium: assumed range roughly $1.9M to $3.7M.
  Higher confidence earns more when later independent
  valuations land near yours and loses more when they don't.

  Possible score for this forecast: -7.1 to +7.1
  Your current score starts at 0 and may change
  when independent valuations arrive.

  [Submit valuation]   [Skip]
```

The **implied multiple** (EV ÷ SDE or EBITDA, whichever the listing reports) updates as the user types; it is the sanity check every buyer does anyway and catches entry errors. If earnings are unknown, the line is omitted. The user need not construct a bell curve or choose percentiles. Optional “Why?” notes are private, **not** required, and screened for confidentiality. The possible score range is **the same for all three confidence levels**; the confidence choice changes how points are earned inside that range, not its edges. Show the assumed range for the selected confidence, labeled as system-assumed.

### 4.2 Interpretation of their answer

Let the user enter `v_i > 0`, their **central/typical EV estimate**. Treat it as the median of an internally generated lognormal *opinion kernel* for valuation `V`:

`log V | response_i ~ Normal(log v_i, σ_c²)`.

`σ_c` depends on confidence `c`. **Illustrative defaults for research only** (NOT calibrated uncertainty):

| Selected confidence | `σ_c` on log EV | Assumed central 80% range | Relative aggregation weight |
|---|---:|---|---:|
| Low | 0.55 | roughly ÷2.0 to ×2.0 | 0.6 |
| Medium | 0.35 | roughly ÷1.6 to ×1.6 | 1.0 |
| High | 0.22 | roughly ÷1.3 to ×1.3 | 1.5 |

A lognormal distribution is a **model assumption imposed by PriceAFirm**, not a distribution the buyer claimed to believe. Store the original number and confidence so later models can be recomputed. The aggregation weight governs influence on the crowd figure (bounded, see 5.2); it plays no role in the user's own score (see 6.3).

**Why three levels rather than a user-chosen stake?** A numeric stake adds cognitive cost and invites over-betting. Three kernel widths, scored properly, give the same economic effect: the user picks the width closest to their actual belief because that is what maximizes expected points.

### 4.3 Eligibility

A *scored blind valuation* requires an account to have **not** seen any crowd-derived price, ranking, directional signal, or another user's valuation on that listing/snapshot. Prior familiarity with the business or its original public URL is **not**, by itself, disqualifying. Seeing the **number** of independent valuations on file is not disqualifying. Having received the CIM on an **operator listing** under the operator's NDA is not disqualifying; the operator's NDA expressly permits submitting a PriceAFirm valuation (see 12.2). Having rendered the listing in **Find Deals**, an NDA on a third-party listing that forbids it, or a broker/owner conflict **is** disqualifying. Multiple devices, duplicate URLs and related accounts cannot reset exposure.

Only one scored forecast per person × underlying business × snapshot; corrections can be privately logged but do not mint another scoring opportunity.

### 4.4 After submission

Record the input, confidence, frozen cap, the crowd state before the forecast, model versions, and eligibility status. The post-submission view shows the user's own forecast, the current numeric crowd figure with its count (now including theirs), and the **Reveal source URL** button (free if the count is below 3, 1 point otherwise; already-known URLs the user submitted themselves are free). This is the intended path for a buyer who wants both points and the deal: value first, then reveal. The newly submitted score is `0` until independent *later* assessments arrive.

---

## 5. Crowd valuation aggregation: honesty about uncertainty

### 5.1 Model prior with the ask as one input

Let `x = log(EV)`. The prior is

`p₀(x) = Normal(μ₀, τ²)`, with `μ₀ = w · log(M_ind × E) + (1 − w) · log A`,

where `E` is the listing's reported earnings (SDE or EBITDA, matched to the right multiple table), `M_ind` is the operator's industry-and-size multiple for that earnings type, `A` is the asking price (treated as EV), `w = 0.5` initially, and `τ` is deliberately wide and uncalibrated. Rules:

- Earnings unknown: `μ₀ = log A`.
- No ask (future unlisted businesses): `w = 1`; the prior is the model alone.
- Multiple table: built in Stage 0 from the operator's own closed-deal and valuation experience, versioned, by industry group × earnings type × earnings band. It is a prior, not a claim.

The ask is a *seller's stated price*, not a verified fair value. Blending it with a model prior keeps the ask from being the only anchor and lets the same engine serve a business that has no ask.

### 5.2 Default MVP opinion pool

Construct individual kernels `f_i(x)` from submitted central values and confidence. Define bounded nonnegative weights `a_i` accounting for confidence and correlated/related contributors, with `Σ a_i = 1`. Let `n_eff` measure **effective** independent participation, not blindly the number of accounts. Then:

`F_n(x) = (1 − α_n) p₀(x) + α_n Σ_i a_i f_i(x)`, with `α_n = n_eff / (n_eff + κ)` for a disclosed trial parameter `κ` (e.g., `2`).

This is a **conservative mixture-based opinion pool**, *not* a Bayesian posterior. People usually saw the seller's ask when forming opinions; multiplying reported distributions as independent likelihoods would double-count shared information and yield misleadingly narrow intervals.

Self-declared High confidence affects both `f_i` and bounded weights `a_i`, but an individual weight must be constrained when there are multiple independent reports. Illustrative cap: no user contributes more than 30% of the **human** mixture when 4+ independent participants exist; with fewer, show concentration prominently. Account/organization correlation requires additional controls. Values here are **policy hyperparameters to validate**.

### 5.3 What the product reports, and the independent valuation count

**Two counts exist; one is displayed.**

- `n_ind` (**displayed**): the integer number of **independent valuations** that contributed to the listing's current crowd figure. It counts eligible, sealed, blind forecasts from distinct unrelated parties after deduplication; it excludes related accounts, duplicate submissions, and forecasts voided for contamination or fraud. One person, one count. There are no operator-authored forecasts to exclude, because none exist.
- `n_eff` (**internal**): the fractional effective-participation measure used in `α_n` and in the cap factor `d(m)`. Never shown as a number.

**Display rule:** every surface that shows a listing's crowd valuation, crowd/ask ratio, or crowd-derived ranking shows `n_ind` next to it as “Based on N independent valuations.” Every surface that shows a listing without a crowd figure (the Value queue, the valuation form) shows “Independent valuations on file: N.” Figures are **numeric at every count**; there are no coarse bands and no minimum count for publication.

Show the **estimated aggregate valuation distribution**: median EV, mean EV, P10/P90 range, `n_ind`, disagreement, sensitivity to any one forecaster, `Pr(EV > ask)`, and `median(EV)/ask`, all labeled as model-derived.

Labeling by count:

- **`n_ind = 0`:** Prior only; **no crowd valuation or crowd/ask ranking**. Label: “No independent valuations yet.”
- **`n_ind = 1`:** Single opinion pooled with the prior. Label: “Based on 1 independent valuation.” Shown, not suppressed.
- **`n_ind = 2`:** Label: “Based on 2 independent valuations · preliminary.” URL reveal still free.
- **`n_ind ≥ 3`:** Label: “Based on N independent valuations.” URL reveal now costs 1 point.
- **Many:** Preserve multimodality when experts disagree; never collapse bimodal judgments into a deceptive bell curve.

Report **within-judge modeled uncertainty**, **between-judge disagreement**, and **external calibration evidence** separately. More respondents reduce uncertainty about *the consensus* without proving that consensus is correct.

**Count integrity:** `n_ind` for a given business/snapshot must be identical on the Value queue, the valuation form, Find Deals, the post-submission view, and in every API response. It increments in the transaction that seals an eligible forecast and decrements only through a recorded admin voiding event.

---
## 6. Dynamic signed scoring: a proper score against later independent reports

### 6.1 What is being measured

We want to reward a forecast that predicts later independent professional reports better than the crowd did before it, and penalize one that predicts them worse. Without an observable sale price there is no assumption-free verdict; this is explicitly a **peer-predictive proxy**. Do not portray negative scores as dishonest behavior. The outcome-based channel is out of scope for MVP; store enough state that one could be added later.

### 6.2 Freeze the cap before submission

The cap depends on **effective independent coverage immediately before submission** and on nothing else. Let `m_i = n_eff(before forecast_i)` and

`d(m_i) = 1 / sqrt(1 + m_i)`, `C(m_i) = 10 × d(m_i)`.

The forecast's possible score is `[−C(m_i), +C(m_i)]` **for every confidence level**.

| `m_i` | Cap `C` | Range shown |
|---:|---:|---|
| 0 | 10.00 | −10.0 to +10.0 |
| 1 | 7.07 | −7.1 to +7.1 |
| 3 | 5.00 | −5.0 to +5.0 |
| 9 | 3.16 | −3.2 to +3.2 |

Confidence does not touch the cap. It changes the kernel, and the kernel changes how many points a given outcome yields inside the cap (6.3). This is deliberate: confidence-specific caps would distort the confidence choice, and the cap is the one thing the user sees before deciding.

The cap is **immutable for that entry**. If another qualifying valuation arrives while the form is open, recompute the cap and require the user to confirm the new one before sealing. Later information changes the score, not the cap. Caps fall as coverage rises, which pushes contributors toward thinly covered listings. The scale is a game-policy hypothesis.

**Newcomer floor:** across an account's first 5 scored forecasts, the cumulative posted score is floored at −3. Implementation: scores are computed normally; when posting ledger deltas for forecasts in the first-5 set, the system clips the running sum of their posted scores at −3, and later positive revisions first restore the clipped amount. The floor is per account for life, applies once, and is disclosed on signup.

### 6.3 Scoring rule

At the moment participant `i` submits, snapshot:

- `F_before_i`: the crowd predictive distribution on log EV *before* the forecast.
- `q_i(y) = Normal(log v_i, σ_c² + σ_obs²)`: the user's kernel smoothed by an observation-noise floor `σ_obs`, because later judges are noisy, correlated humans, not the true value.
- `C(m_i)`.

When a later independent qualified participant `j` seals `y_j = log(v_j)`:

`Δ_ij = log q_i(y_j) − log g(y_j | F_before_i)`,

where `g(· | F)` is `F` smoothed by the same `σ_obs`. Clip each judge's contribution to `[−d0, +d0]`, exclude the usual (related accounts, exposed judges, coordination, voided forecasts), dampen near-duplicate peer reports, and average robustly:

`z_i(t) = robust_weighted_average_j[clip(Δ_ij, −d0, +d0)]`.

Then

`score_i(t) = C(m_i) × clip(z_i(t) / z_ref, −1, +1)`.

`σ_obs`, `d0`, `z_ref` are versioned calibration parameters chosen in offline trials. With no qualifying later evidence, `score_i(t) = 0`.

**Why this is incentive-compatible (within the three-level menu):**

- The log score is strictly proper: expected `log q(Y)` is maximized by the `q` that matches the user's actual belief about where later reports will land.
- The baseline term `log g(y_j | F_before_i)` does not depend on anything the user chooses, so subtracting it preserves the maximizer; it just makes the score relative to the crowd, like a skill score.
- Among three kernels of fixed widths, expected score is maximized by the width closest (in KL divergence) to the user's real belief. A user who is unsure should pick Low; picking High when unsure has negative expected points because the narrow kernel pays little for a report that lands two widths away.
- The mapping from `z` to points is linear with a cap that is identical across confidence levels, so it does not reorder the choice. Symmetric clipping is a mild distortion toward lower-variance choices; the simulation harness measures it and the parameters are set so that honest selection remains optimal across the realistic range.
- The previous design scored the *marginal improvement of the crowd mixture* (`F_after` vs `F_before`). The log of a mixture is not a proper score in the user's own kernel, and confidence-specific caps compounded the problem. Both are dropped.

The maximum attainable `Δ` for a narrow kernel is higher than for a wide one (its peak density is higher), and the minimum is lower; that is the whole mechanism by which High "stakes more" without any separate stake. The product never displays the attainable extremes, because they depend on where `v_i` sits relative to the crowd.

### 6.4 Recalculation after every new opinion

Every eligible newly sealed report triggers an asynchronous, idempotent job:

```text
new independent valuation accepted for listing L:
    seal respondent's value, confidence, snapshot version and cap
    increment n_ind for (business, snapshot)
    compute crowd model including the new report
    for each earlier eligible forecast i on L:
        recompute score_i using all eligible later reports now available
        apply newcomer floor if i is in its account's first-5 set
        delta = newly_computed_score_i - previously_posted_score_i
        append signed POINT_ADJUSTMENT(delta) to i's ledger immediately
    record the new user's score as 0 until later evidence arrives
    invalidate crowd caches without releasing individual valuations
```

For the **new** report, freeze `F_before`, the kernel parameters and the cap. The job must not change its `m_i` or cap. Processing and wallet updates are atomic or exactly-once via unique event IDs; retries never mint duplicate points. A score can continue changing long after submission.

**Example:** A has +3.2 points for a report. A new independent opinion changes their score to +1.5, so the ledger posts **−1.7**. Another opinion later makes the score −0.8, posting **−2.3**. The report remains open to future updates.

### 6.5 Remaining limitations

Peer-predictive scoring uses later opinions as a proxy and can reward conformity among later judges or coordinated reports. Exaggerated confidence is no longer profitable in expectation, but collusion and off-platform influence remain. Accordingly:

- Pilot with verified invited buyers; one real participant per business/snapshot; related-party checks.
- Stress-test collective shared biases, copied reports, and intentional collusion in the simulation harness; verify in simulation that honest confidence selection maximizes expected points under the chosen `σ_obs`, `d0`, `z_ref`.
- Keep minimum report noise, bounded influence weights, caps and immutable submission order.
- Do not suppress sincere minority valuations.
- Do not call the result **actual accuracy**.
- Permit freezing suspicious score events for investigation, with an auditable reason and an appeal process.

### 6.6 “How many points could this earn?”

```text
VALUE BUSINESSES — Sorted by MAX POSSIBLE POINTS

Business                       Possible score   Valuations   Your fit
Industrial maintenance, GA     ±10.0 pts        0            Strong
Regional logistics, FL         ±7.1 pts         1            Strong
Specialty manufacturing, NC    ±5.0 pts         3            Moderate

Select a business to see the frozen listing facts and value it.
Your confidence choice changes how points are earned, not the range.
```

These values depend on existing effective coverage, not on whether the crowd thinks the company is attractively priced, so sorting by them **does not reveal crowd valuation direction**. The **Valuations** column is `n_ind`; it is monotonically related to the cap and adds no directional information. The user can sort by **Maximum points** or **Valuations (low to high)** and filter by size, geography and industry.

---

## 7. One points balance: instant spending and retrospective deductions

**There is exactly one account balance, denominated in points.** No separate “pending” or trading-cash wallet.

`balance(t) = 3 + Σ_current scored contribution values(t) (after newcomer floor) − paid URL unlocks + refunds + authorized adjustments`.

Compute this through an immutable **event ledger**. The account begins with `WELCOME_GRANT(+3)`; a paid reveal adds `URL_REVEAL(−1)`; a free reveal adds `URL_REVEAL_FREE(0)` so the entitlement is recorded; every forecast revaluation posts `SCORE_CHANGE(±delta)`.

**When a reveal costs a point:** the listing's `n_ind` is **3 or more at the moment of the reveal**. Below 3 the reveal is free, because a crowd figure built on fewer than three opinions is not worth charging for and the URL itself is public. An unlock recorded as free stays free; a listing crossing 3 later does not retroactively charge anyone. A user who submitted the URL themselves is never charged for it.

**Any points visible may be spent immediately**, provided the pre-charge balance is at least 1. A later retroactive negative score can drive the balance below zero. Previously unlocked URLs **remain unlocked**; future points first pay down the deficit; new paid reveals are disabled until the balance is at least 1 again. Free reveals remain available at any balance. No real-money collections, transferable coins, cash prizes, or penalties beyond the internal economy.

### Example transaction history

| Event | Balance |
|---|---:|
| Signup grant | 3.0 |
| Reveal URL on a listing with 1 valuation (free) | 3.0 |
| Reveal URL on a listing with 5 valuations | 2.0 |
| Reveal URL on a listing with 4 valuations | 1.0 |
| Later evidence improves an earlier report's score by +2.7 | 3.7 |
| Reveal URL on a listing with 6 valuations | 2.7 |
| New later evidence makes that report less predictive: −4.1 adjustment | −1.4 |
| Subsequently earns +2.5 | 1.1; can again unlock one listing |

(The newcomer floor would have limited the −4.1 posting if that report were among the account's first five and the floor had been reached; the example assumes it was not.)

**Transaction invariants:** deduction and entitlement commit atomically; check for an existing unlock before debiting; read `n_ind` inside the same transaction; refund automatically if no functioning URL can be provided; prevent concurrent double-spend. Charge once per underlying business/snapshot, not per mirror URL or repeated open. Rate-limit free reveals (e.g., 20 per account per day) so the free tier cannot be used to scrape the catalog.

**UI language:** “Balance 1.1 points,” “Possible: −7.1 to +7.1,” “Your score for this business: +1.5 (can change),” “Reveal URL — free (2 valuations),” “Reveal URL — 1 point (5 valuations).”

---

## 8. Browsing and blindness: two modes, one simple rule

If a surface tells a person what the crowd thinks of a particular business, their later valuation of that business is no longer independent. The MVP handles this with one rule: **anything rendered in Find Deals is exposed.** No opaque slots, no two-step preview.

### 8.1 Mode A — **Value businesses** (no crowd-direction leakage)

Purpose: earn points by providing independent judgments.

Show for every eligible listing: neutral industry/category and nonidentifying factual description; general geography and size (ask, revenue, typed SDE/EBITDA); frozen snapshot date and valuation assumptions; **possible score**; **number of independent valuations on file**. Never forecast central values, crowd/ask, or directional disagreement.

Users may filter by size, geography, industry and sort by **maximum points**, by **fewest valuations**, or by fit. The filters are the same as in Find Deals, so a buyer with acquisition criteria can screen neutrally here first, value what interests them, and see the crowd figure and the URL on the post-submission view. That is the recommended path for anyone who wants both points and deals.

Clicking a card opens the blind valuation form. Knowing the listing or its URL from ordinary dealings does not disqualify; having seen **PriceAFirm-derived value information** does. The count is not value information.

### 8.2 Mode B — **Find deals** (crowd-informed discovery)

Purpose: identify businesses that satisfy acquisition criteria **and** appear attractively priced relative to the crowd's model.

Step 1 — First entry into Find Deals in a session shows a gate: *“Listings shown here include crowd valuations. Any listing you see here can no longer earn you valuation points. If you want to value a listing first, use Value Businesses.”* The user confirms once per session (or sets a persistent preference).

Step 2 — User enters natural-language criteria. Search is **free**.

Step 3 — Results are **identifiable listing rows**: industry, geography, size, ask, `median(EV)/ask`, `Pr(EV > ask)`, “Based on N independent valuations,” and a **Reveal URL** button labeled free or 1 point. Rows are ranked by crowd signal × fit; listings with `n_ind = 0` appear ranked by fit only, labeled “No independent valuations yet.” The buyer may filter by minimum valuations.

Step 4 — The server records an irreversible `exposure_event` for **every row it returns**, before returning it. Pages are small (10 rows); only returned rows are exposed. Scrolling to the next page exposes the next 10. No listing is exposed by a count or facet alone, because the result surface contains nothing but full rows.

Step 5 — Reveal: free if `n_ind < 3`, 1 point otherwise, atomic, recorded; the user follows the link to the broker. Reopens free.

**Why this is the right simplification:** the integrity requirement is that no one scores a blind valuation after seeing crowd value. Recording exposure on render satisfies it exactly, with no inference rules, no cross-mode tokens, no narrow-query edge cases. The cost is that a buyer who browses Find Deals gives up points on what they browsed; the session gate and the value-first path make that a conscious choice.

### 8.3 Exact exposure policy by action

| User action | Costs points? | Still eligible for scored blind valuation? |
|---|---|---|
| Filter/sort neutral listings in **Value businesses** (including by valuation count) | No | **Yes** |
| View permitted facts and valuation count in the neutral queue or valuation form | No | **Yes** |
| Enter a source URL already known independently | No | **Yes**, subject to source and confidentiality rules |
| Open an operator-listing invite link after NDA | No | **Yes** |
| Submit blind estimate/confidence | No | Already submitted for that listing version |
| See a listing row rendered in **Find deals** | No | **No**, permanently for that snapshot |
| Reveal URL from Find Deals | Free below 3 valuations, 1 point at 3+ | Already exposed |
| Reveal URL from the post-submission view | Free below 3, 1 point at 3+ | Already submitted |
| See the crowd figure on the post-submission view | No | Already submitted |

Server-side exposure events attach to **underlying business + snapshot + account/person**. API and export responses enforce the same rule; the Find Deals endpoint cannot return a row without writing its exposure first.

### 8.4 Prototype of the buyer discovery journey

```text
FIND DEALS                                      Balance: 3.0
Search: [B2B recurring services in GA or FL; SDE $300k+]
Filters recognized: B2B services · GA/FL · SDE ≥ $300k · min valuations: any

8 matches (ranked by crowd signal and fit)

Commercial maintenance | Metro Atlanta | Ask $2.6M
$3.2M revenue | SDE $520K | Crowd median EV/ask 1.23x | P(EV > ask) 0.78
Based on 4 independent valuations
[ Reveal source URL — 1 point ]

Dental practice | Tampa Bay | Ask $1.5M
$1.4M revenue | SDE $390K | Crowd median EV/ask 0.91x | P(EV > ask) 0.38
Based on 1 independent valuation
[ Reveal source URL — free ]

Landscaping | Jacksonville | Ask $1.1M
$1.9M revenue | SDE $310K | No independent valuations yet
[ Reveal source URL — free ]
```

All figures are fictional UI examples. Every row shown is exposed for that user at render time.

---
## 9. User-submitted broker URLs: source a deal and value it immediately

Acquisition buyers routinely examine listings on broker sites and reject many. PriceAFirm lets them contribute that otherwise-lost judgment.

### 9.1 Flow

```text
ADD A LISTING
Paste the broker's public listing URL:
[ https://some-broker.example/business/12345 ] [Continue]

[Source check / extraction]
✓ Public broker listing page (not on the excluded list)
✓ Existing listing matched or new draft created

Detected listing (correct mistakes before valuing):
Industrial services · Florida · Ask $3.6M
Revenue $4.5M · EBITDA $610K · Snapshot Oct 2026
Terms: [See valuation assumptions]
Independent valuations on file: 0

Value this business now? (optional, encouraged)
Your estimated EV: [ $ 3,950,000 ]   = 6.5x EBITDA
Confidence: [ Low ] [ Medium ] [ High ]
Possible score: −10.0 to +10.0

[Submit URL + valuation]   [Submit URL only]
```

The valuation prompt appears **immediately after URL validation**. Submitting a URL alone earns nothing. The submitter is never charged to reopen that URL.

### 9.2 Source gating *before* extraction

1. Normalize the URL, strip tracking parameters, validate scheme and host, detect known listing IDs / alternate domains / syndication mirrors.
2. Check domain and final redirect chain against the **excluded-source list**: BizBuySell (its Terms specifically restrict extraction, database creation and certain links), any site whose publisher has complained and been removed, and any site counsel flags. **There is no allowlist and no permission step** for other broker sites.
3. Fetch the public page through the safe proxy; honor robots.txt and polite rate limits as engineering hygiene; parse **factual fields only** (industry, general location, asking price, revenue, typed cash flow). Never store photos, authored descriptions, PDFs or anything beyond facts and the link.
4. Present normalized facts for user verification; resolve duplicates against canonical businesses, not URLs. A second URL for the same business cannot create a second scoring pool or reset exposure.
5. If extraction is incomplete, ask the user to check factual fields using public information, or route to lightweight admin review. Missing fields remain unknown. Do not infer EBITDA from SDE or vice versa.
6. Seal the snapshot and cap when fields are validated. If moderation is required, show the cap as provisional and tell the user the scored entry becomes effective on approval.

**Security:** Treat URLs as untrusted input. Protect against SSRF (no local/private IPs, cloud metadata addresses, arbitrary redirects), hostile HTML, huge payloads, malicious files, exfiltration and scripts. Restricted egress and a safe parser, never an unrestricted browser.

### 9.3 Why URL knowledge is not score contamination

Having visited the broker listing is *precisely the type of expertise we want*; it reveals nothing about PriceAFirm's crowd. If the pasted URL maps to a listing the user has already seen in Find Deals, **do not** offer a scored valuation; explain the reason without exposing private forecasts.

---

## 10. Natural-language buyer search and deal ranking

Example search:

> “B2B businesses in Georgia or Florida with at least $300,000 SDE or $500,000 EBITDA, under $5 million asking, preferably recurring commercial customers; exclude restaurants.”

### Processing pipeline

1. Parse user text into **reviewable filter chips**: industry inclusion/exclusion, semantic adjacent categories, geography, asking range, revenue, cash-flow minimum by **correct metric type**, business model descriptors, minimum independent valuations.
2. Ask a concise clarification only when an ambiguity changes results materially; otherwise show the interpretation for correction.
3. Apply deterministic geographic, price and financial filters to normalized facts. Missing financial types remain **unknown**; never convert SDE ↔ EBITDA or guess earnings.
4. Add semantic industry matching on permitted tags so “industrial maintenance” can match several defensible codes.
5. In **Value Businesses**, return neutral rows (no crowd figures). In **Find Deals**, return identifiable rows with numeric crowd figures and counts, writing exposure first.
6. Rank Find Deals rows by `Pr(EV > ask)` moderated by uncertainty and count, times buyer fit. Raw `median(EV)/ask` is an optional sort. Rows with `n_ind = 0` rank by fit only.
7. Exclude listings whose source has been removed on complaint.

Searching never consumes points. Only a **URL reveal at 3 or more valuations** costs 1 point.

### Opportunity ranking vs valuation-opportunity ranking

| Ranking | Based on | Seen before a scored valuation? |
|---|---|---|
| **Maximum possible points** | Effective prior coverage only | **Yes**; discloses no direction |
| **Best acquisition opportunities** | Probabilistic crowd/ask signal + buyer fit + uncertainty | **No**; rendering forfeits later scoring |

Never incorporate crowd EV, crowd/ask, score results, or directional disagreement into the Value Businesses ordering or personalized recommendations. The independent valuation count appears in both because it carries no direction.

---

## 11. Percentile ranking and competitive feedback

Provide a **private percentile** of forecasting skill against other eligible users; no public leaderboard. **Do not label it observed accuracy.**

```text
MY PROFILE
Available points                       5.4
Forecasts made                        12
Current combined contribution score  +7.4
URLs unlocked                         5 (2 paid)
Forecast skill (peer-predictive)      78th percentile · provisional
```

### Making the percentile defensible

- Same scoring-model version across the compared cohort.
- Compare **normalized peer-predictive performance** (`score_i / C(m_i)` averaged with shrinkage toward the cohort mean), not total points, so prolific early entrants do not dominate.
- Require an illustrative minimum of **five scorable forecasts with adequate later assessments**; below that show “Not enough evidence for a meaningful skill percentile.”
- Exclude connected accounts, invalid forecasts, and manipulative later reports. Never reveal who other participants are.
- Disclose that the percentile compares performance *under the peer-predictive model*, not realized sale-price accuracy.

**Later (not MVP):** an opt-in **verified valuer** status for sustained top-percentile performers, visible only with their consent, so that the operator can later engage them for off-market valuations. Identity remains private by default.

---

## 12. Confidentiality, participant privacy, and terms of service

### 12.1 Participant confidentiality

The platform connects every forecast internally to the participant account and the business; it cannot score, dedupe, or aggregate otherwise. What the product promises outward:

> **PriceAFirm will not show or sell any identifiable participant's individual valuation, confidence selection, or participation identity to other users, brokers, or business owners as part of the product.** Aggregate crowd figures are published per listing with the number of independent valuations behind them, at any count. Internal operators require limited access to run the service. Legally compelled disclosure cannot be categorically ruled out.

**No directory of participants.** No identities, profile pages, per-company contribution history, or public leaderboard. Brokers and owners cannot ask “which buyer priced my company?” A figure resting on one valuation necessarily reflects that one anonymous opinion; this is accepted by design and stated in the Terms.

### 12.2 Contributor authorization and NDA safeguards

Before a user's first forecast/URL contribution (and in the Terms), require confirmation along these lines:

> “I am submitting only my own independently formed valuation judgment. My submission does not disclose or rely on confidential information in a way that violates an NDA, confidentiality undertaking, broker agreement, employment duty, or other obligation, except where the listing's own broker has expressly permitted a PriceAFirm valuation. I will not submit confidential memoranda, private financial statements, personally identifiable information, or restricted listing content.”

**Operator listings:** the operator's buyer NDA and buyer-qualification flow expressly permit the buyer to submit a numeric valuation and confidence to PriceAFirm, and the operator's listing agreement discloses to the seller that aggregate crowd valuations with counts may be published for the listing. Buyers who received the CIM are therefore eligible and, in practice, better informed than listing-only valuers; their forecasts are tagged `information_level = cim` internally for analysis, count toward `n_ind` normally, and are scored normally.

**Third-party listings:** the ordinary rule applies; a buyer under a third-party NDA that forbids disclosure of derived opinions must not submit. No uploads or pasted deal descriptions in MVP. Optional rationale fields must warn against confidential data and remain private.

### 12.3 Suggested Terms and Privacy Notice elements (drafting instructions for counsel)

1. By submitting a forecast or URL, the user represents it does not breach NDAs, contracts or legal duties, subject to the operator-listing permission above.
2. The service does not request or authorize disclosure of confidential information.
3. The service's purpose is aggregated, nonbinding, probabilistic business valuation and source discovery; forecasts and aggregates are not offers, appraisals, price guarantees, investment recommendations, or executable prices.
4. Individual participants' identity, valuations, confidence choices and histories are not disclosed to other users, brokers or owners through the product. Operator access, security obligations, service providers and narrow lawful disclosures are covered in the privacy notice.
5. Aggregate crowd valuations and their independent-valuation counts are displayed per listing with no minimum count; a contributor accepts that a listing with few valuations displays a figure reflecting few opinions, including their own, without naming them.
6. Points are noncash, nontransferable, carry no redemption rights, may be adjusted up or down under the versioned scoring policy, and can become negative after earlier spending. Revealed URLs are not clawed back. The newcomer floor is described.
7. Privacy, deletion, retention, legal-request, abuse, breach and closure policies are stated without impossible absolute promises.
8. Third-party listing facts are collected from public listing pages without prior permission. PriceAFirm stores facts and a link only, attributes the source, and **removes a publisher's listings on request** within a stated period. Operator listings are published under the operator's own rights.

**Practical promise:** “We do not publicly identify our participants or disclose anyone's individual valuation of a specific company.”

### 12.4 Data security defaults

- Collect only the account information necessary for qualification, fraud controls and points.
- Encrypt at rest and in transit; isolate contributor-private records; log administrative access; retention limits, backups, incident response.
- Keep private forecast IDs, participant IDs and source URL mapping out of analytics exports and public endpoints; prevent enumeration and referrer leakage.
- Record consent and per-submission acknowledgements by timestamp and version. Handle takedowns without silently mutating historic score calculations.

---
## 13. Listing sources: operator listings first, permissionless ingestion, removal on complaint

### Source policy

1. **Operator listings (first):** Every active NBA/Synergy listing is in the catalog with full rights to publish facts, crowd figures and the source URL. Buyers who inquire are invited to value (see 17.1).
2. **Third-party broker sites (second):** Public listing pages are ingested without prior permission, via user-submitted URLs and operator-curated additions. PriceAFirm stores facts and the link, attributes the broker, sends the broker the reveal traffic, and **removes the broker's listings on complaint**. There is no partner program and no permission record to maintain.
3. **Excluded:** BizBuySell (listing URLs and content) absent an express license, and any publisher that has complained.

**Honest note for counsel:** ingesting without permission carries legal exposure under some sites' terms and under access-related law in some jurisdictions. The mitigations are facts-only storage, attribution and linking, no copied creative content, prompt removal on complaint, and rate-limited polite fetching. Counsel reviews this policy before third-party ingestion goes live; operator listings carry no such exposure and launch first.

**Source record** per domain and listing:

- `source_type` (operator / third-party / excluded), `publisher`, `first_seen`, `attribution_text`.
- `complaint_received_at`, `removed_at`, `removal_reason`, `notes`.
- A removed source: no new displays, reveals, or forecasts; existing unlocks honored; audit preserved; prior scores unchanged.

**Removal SLA:** complaint acknowledged within 1 business day, listings removed within 3. The contact route is on every listing page.

### Automated buyer valuation requests (operator listings)

**Trigger.** The operator's buyer-qualification system (outside PriceAFirm) decides when a buyer has had a listing's materials for 1 to 2 weeks and sends PriceAFirm one message per buyer per listing: **buyer name, buyer email, listing URL**, plus an optional idempotency key and information level (default `cim`). The same buyer can appear in many messages for many listings; each message is handled independently against one account.

**Listings are identified by URL.** PriceAFirm resolves the URL to a canonical business (URL hash, then canonical domain + listing ID, so tracking parameters or mirrors do not create duplicates). If the URL is new, PriceAFirm **onboards the listing first**: excluded-source check, safe fetch, facts-only extraction, snapshot creation. A new listing is approved automatically only when extraction found an asking price plus earnings or revenue; otherwise it lands in Admin > Review for an operator to complete the facts, and the buyer's request is **held** and emailed automatically when the listing is approved.

**Account.** One account per email, created automatically on the first request (email marked verified, invited flag set, display name from the message, 3-point grant). Later requests for the same email reuse it.

**Eligibility before sending.** No email is sent if the buyer already valued that business, or if they have Find Deals exposure to it (a scored valuation would be rejected). An open, unexpired request for the same buyer and listing is not re-sent unless the message asks for a resend; a resend mints a new link and the old one stops working.

**Email.** Short and personal: "You've had the materials on [listing] for a little while. What do you think it is worth?", one button, a privacy line, and the link lifetime. No em dashes, no signature block. Every email is recorded in an outbox with the sign-in link redacted; when sending is not configured the email is captured there instead of delivered.

**Link.** `/invite/<token>`: a random 256-bit token, stored only as a hash. Valid 30 days (configurable) and reusable until then, because corporate email scanners often open links before the recipient. Opening it signs the buyer into their own account (replacing any other session in that browser), records the open, and lands on that listing's valuation form with a short welcome note. Expired or revoked links fall back to the normal sign-in page with an explanation. Admins can resend or revoke any link.

**Information level.** Forecasts submitted by a buyer with a request for that listing are tagged `information_level = cim` (or `listing` if the message says so), counted toward `n_ind` and scored normally. The request is marked submitted.

**Later sign-ins.** The buyer can request a one-time email link at any time, or set a password under Account and sign in with email + password. Neither is required to use the valuation link.

**Security.** The endpoint requires a bearer secret held only by the qualification system. Requests are idempotent on the caller's key. Responses never include other buyers' data.

---

## 14. Roles, screens and information architecture

### 14.1 Top navigation

**Find Deals** · **Value Businesses** · **Add a Listing** · **My Points** · **My Unlocked Listings**

Mobile bottom navigation: **Find Deals**, **Value**, **Add URL**, **Points**.

### 14.2 Screen-by-screen product requirements

| Screen | Essential content | Primary action | Deliberately omitted |
|---|---|---|---|
| Landing | “Find businesses other buyers may undervalue. Share your opinion to unlock more deals.” | Sign up / search | Exchange metaphors, animated stock ticker |
| Signup | Email verification; brief acquisition profile; 3-point starting balance; newcomer floor explained. Invited buyers skip this: their account is created automatically | Get started | Payment details |
| Invite landing (operator listing) | Auto sign-in from the emailed link, welcome note, the listing's facts, straight into the valuation form | Submit valuation | Any crowd figure before submission; any signup or password step |
| Sign in | Email me a link, or email + password | Sign in | Mandatory passwords |
| Account | Set or change an optional password | Save | Profile pages visible to others |
| Value queue | Industry/geo/size, snapshot date, possible score, **independent valuation count**, fit | Sort by **maximum points**, choose business | Crowd values, EV/ask, directional rank |
| Valuation form | One EV amount with live implied multiple, Low/Medium/High with assumed range, fixed possible score, terms, count | Submit blind valuation | PDF sliders, essays |
| Post-submission | Own forecast, score and cap, numeric crowd figure with count, **Reveal URL (free / 1 point)** | Reveal / value another | Claims of verified accuracy |
| Find Deals | Session gate, natural-language input, filter chips, identifiable rows with numeric figures, counts, reveal buttons | Reveal URL | Participant identities or individual valuations |
| Source reveal | Listing URL, broker attribution, charged or free, remaining balance | Visit broker | Capturing inquiry without consent |
| Add URL | URL, excluded-source check, normalized facts, count, EV with multiple, confidence, cap | Submit URL + valuation | Uploads, pasted descriptions |
| My Points | Single balance, forecast history, per-report deltas, URL deductions, newcomer floor status, percentile if qualified | Open history | Dual balances |
| My Unlocked | Revealed URLs, snapshot date, broker link, current count, paid/free | Return to listing | Other users' histories |
| Admin | Source states and complaints, review queue with fact editing (approval releases held requests), dedupe, voids, model versions, scoring audit, valuation requests (send manually, resend, revoke, status), email outbox | Approve/reject/remove | Public directory |

### 14.3 Copy and interaction rules

- Use **“What do you think this business is worth?”**, not “enter your PDF” or “place a bid.”
- Implied multiple updates live: “= 3.9x SDE”.
- Confidence selector updates text immediately: “High: assumed range roughly $2.0M to $3.4M. Earns more when later independent valuations land near yours, loses more when they don't. Possible score unchanged: −7.1 to +7.1.”
- “Your balance may rise or fall as additional independent opinions arrive.” Repeat on signup and first submission.
- Every crowd figure: **“Based on N independent valuations”**; `N = 0`: “No independent valuations yet (prior only).”
- Value queue and form: **“Independent valuations on file: N.”**
- Find Deals gate: “Listings here include crowd valuations. Any listing you see here can no longer earn you points.”
- Reveal buttons: “Reveal source URL — free (2 valuations)” / “Reveal source URL — 1 point (5 valuations).”
- Mobile form completion comfortably under a minute.

### 14.4 Visual design direction

Serious financial intelligence tool with an accessible reward loop. Dark charcoal, warm white, one accent, clear hierarchy, concise money formatting. Gamification from balances, score movements and the private percentile; no confetti or upward arrows. Keyboard operation, screen-reader labels, high contrast, noncolor-only gains/losses. The valuation count gets one consistent treatment on every surface.

---

## 15. Technical architecture and data model

### 15.1 Suggested lean stack

- **Frontend/API:** Next.js + TypeScript, server-side exposure and entitlement checks.
- **Database:** PostgreSQL; transactional wallet, immutable ledger events, indexed listing filters.
- **Quant engine:** Python + NumPy/SciPy service with versioned kernels, prior tables, mixture parameters and scores; a lightweight queue for recalculations.
- **Natural-language interface:** LLM extraction of *filter intent only* into reviewed JSON; deterministic predicates; optional semantic industry index.
- **Auth/security:** Email link sign-in plus optional password; accounts for invited buyers created server-side; invited-user gate, related-account checks, audited model deployments.
- **URL ingestion:** Excluded-source list, safe fetch proxy, polite rate limits, facts-only parser, manual fallback.
- **Operator integration:** the buyer-qualification system calls `POST /api/invites` with buyer name, email and listing URL once a buyer has had the materials for 1 to 2 weeks; PriceAFirm onboards the listing, creates the account, and emails the auto-login valuation link (see Section 13).
- **Email:** transactional sender (Resend) for valuation requests; Supabase Auth email (custom SMTP) for one-time sign-in links.

### 15.2 Core tables and invariants

| Table/entity | Fields and important invariants |
|---|---|
| `users` | pseudonymous internal ID, verification, org grouping, role, trust status, buyer filters, `first5_floor_state`, `password_set` |
| `source_domains` | `source_type`, publisher, excluded flag, complaint/removal fields |
| `businesses` | canonical business key; industry, geography, size, earnings and type; **optional** ask; **independent of any listing**, so an unlisted business can exist (owner-side, Stage 4) |
| `listing_snapshots` | business FK (optional in future), source URL hash, facts, snapshot date, ask (EV), immutable version/hash, `independent_count` (`n_ind`) maintained transactionally |
| `source_submissions` | submitting user, URL, exclusion check, review status, canonical match |
| `listing_invites` | buyer account, email, name, listing (business + snapshot), token hash, information level, caller request ID (unique), issued/expires/first and last opened/open count/submitted/revoked, email status |
| `mail_outbox` | every outbound email with sign-in links redacted, delivery status, provider ID |
| `forecast_submissions` | user, business, snapshot, value, confidence, kernel version, `information_level`, timestamp, blind eligibility, `counts_toward_independent`, frozen `F_before` reference and cap |
| `aggregation_runs` | forecast set hash, prior parameters and multiple-table version, weights, mixture stats, `n_eff`, `n_ind` |
| `score_contracts` | `F_before` snapshot, kernel parameters, `m_i`, `C(m_i)`, scoring-model version |
| `score_evaluations` | each run, eligible later reports, raw score, floored score, previous posted score, delta, exceptions |
| `point_ledger` | unique signed event, amount, reason, account, related forecast/URL, atomic balance update |
| `url_unlocks` | unique `(account, business, snapshot)`, `charged` boolean, `count_at_unlock`, reopens free |
| `exposure_events` | user/person × business × snapshot × surface (`find_deals_row`, `post_submission`), timestamp |
| `query_events` | normalized filters, returned row IDs, rate-limit and analytics |
| `skill_statistics` | eligible count, normalized skill metric, percentile, sufficient-evidence flag, verified-valuer opt-in (future) |
| `admin_audit` | source removals, voids, model migrations, overrides |

**Critical invariant:** a scored blind valuation is rejected if `(user, business, snapshot)` has any `find_deals_row` exposure before submission, derived from canonical business IDs, never from the page the user is on.

**Score invariant:** `current forecast score = sum of score-change ledger deltas`; `wallet = 3 + net adjustments − paid unlocks + refunds`; `|score| ≤ C(m_i)`; first-5 cumulative posted score `≥ −3`.

**Count invariant:** `independent_count = count(forecast_submissions where counts_toward_independent)` with one per distinct unrelated party, updated in the sealing or voiding transaction; every API response carrying a crowd figure carries it.

**Reveal invariant:** charge 1 iff `independent_count ≥ 3` at reveal time and the user did not submit the URL; record `charged` and `count_at_unlock`; never recharge.

### 15.3 API outline

```text
POST /search/interpret                 text -> editable structured filters
GET  /value-opportunities              neutral fields + cap + independent count
GET  /valuation-question/:id           frozen snapshot, eligibility, cap, count
POST /api/invites                      bearer secret; buyer name + email + listing URL -> onboard listing, create account, email link
GET  /invite/:token                     auto sign-in, then redirect to the listing's valuation form
POST /forecasts                        amount + confidence; seal or reject if exposed
GET  /forecasts/:id                     own data, current score, cap
GET  /wallet                            one balance, event history, floor status
GET  /profile/skill                     private percentile if enough evidence
POST /sources/validate-url             exclusion check, dedupe, fact extraction
POST /sources/submit                   URL and optional blind forecast
POST /discovery/search                 identifiable rows; writes exposure per row BEFORE returning
POST /businesses/:id/reveal-url        atomic reveal; charges 1 iff count >= 3
GET  /unlocked                          revealed URLs, paid/free
POST /admin/sources/:id/remove         complaint handling, restricted
POST /admin/forecasts/:id/void         count-voiding event with reason, restricted
POST /admin/scoring-recompute          idempotent audit/rerun, restricted
```

Any endpoint returning a crowd figure checks **(1)** source not removed, **(2)** exposure written (Find Deals) or submission exists (post-submission), **(3)** snapshot compatibility, and always returns `independent_count`. No hidden crowd fields on neutral endpoints.

### 15.4 Event processing sequence

```text
VALUATION_REQUEST(name, email, listing URL) -> RESOLVE_OR_ONBOARD_LISTING -> ENSURE_ACCOUNT
   -> CHECK_ELIGIBILITY -> EMAIL_LINK (or HOLD UNTIL LISTING APPROVED)
INVITE_LINK_OPENED -> AUTO_SIGN_IN -> OPEN_VALUATION_QUESTION
SOURCE_URL_SUBMITTED (if any)
   -> CHECK_EXCLUSION -> FETCH_FACTS -> CANONICALIZE -> APPROVE_SNAPSHOT
   -> SHOW_FORECAST_FORM (CAP + COUNT + IMPLIED MULTIPLE)
   -> SEAL_BLIND_FORECAST_WITH_FROZEN_CAP_AND_F_BEFORE
   -> INCREMENT_INDEPENDENT_COUNT (SAME TRANSACTION)
   -> UPDATE_CROWD_DISTRIBUTION
   -> RECOMPUTE_EARLIER_ELIGIBLE_SCORES (APPLY NEWCOMER FLOOR)
   -> POST_SCORE_DELTAS_TO_LEDGER
   -> SHOW_POST_SUBMISSION (FIGURE + COUNT + REVEAL BUTTON)

FIND_DEALS_GATE -> SEARCH -> WRITE_EXPOSURE_PER_ROW -> RETURN_ROWS
   -> URL_REVEAL (FREE IF COUNT < 3, ELSE CHARGE 1 ATOMICALLY)
```

---

## 16. Fraud and incentive-design safeguards

Points buy crowd-informed URLs, so duplicate accounts, collusion and false-confidence submissions have incentives.

Required MVP protections:

- Account verification and human-in-the-loop qualification; one signup grant and one newcomer floor per real person.
- Canonical businesses; one scored report per real contributor/business/snapshot; account and organization clustering; clusters count once toward `n_ind`.
- Caps by coverage; per-account daily scored-submission limits during pilot.
- Reject machine-spammed values, impossible amounts and uniform low-effort submissions, with correction before seal. **Do not treat genuine dissent as spam.**
- No points for adding an unvalued URL, for mirrors/duplicates, or for being first.
- Later forecasts eligible to score others only if blind; detected collusion voids both the score contribution and the displayed count through recorded events.
- Rate-limit free reveals and Find Deals pagination so the free tier cannot scrape the catalog; restrict programmatic enumeration and hidden crowd-value paths.
- Do not expose rare-category activity or precise timestamps that could identify a submitter.
- Overstated confidence is no longer a profitable strategy by construction; the simulation harness confirms this under the chosen parameters before live points.

**Recommendation:** run the scoring engine in **shadow mode** with real blinded pilot forecasts and adversarial simulations; enable live signed updates only when honest-confidence optimality, collusion resistance and floor behavior check out.

---

## 17. Pilot metrics, experiments, and launch gates

### 17.1 Pilot setup

- **Catalog:** every active operator (NBA/Synergy) listing on day one; third-party broker listings added through user submissions and operator curation once counsel signs off on 13.
- **Cold start:** every buyer who has had an operator listing's materials for 1 to 2 weeks receives an automated valuation request for that listing, sent by PriceAFirm when the buyer-qualification system posts the buyer's name, email and the listing URL. Buyers on several listings get one request per listing on one account. No operator-authored valuations, ever.
- **Cohort:** 30–50 invited buyers, plus the inflow of inquiring buyers on operator listings. Run for months, not weeks; expect many listings with 0–2 valuations.

### 17.2 Measure what matters

| Goal | Measurement | What failure would indicate |
|---|---|---|
| Invite conversion | Share of NDA-signed buyers who open the invite and submit | The valuation ask is poorly placed in the buyer journey |
| Contribution friction | Time from listing facts to submitted value + confidence; dropout by step | Even one number is too much, or facts are insufficient |
| Coverage | Distribution of `n_ind` per listing after 1, 4, 8 weeks; share of listings crossing 3 | Scoring and paid reveals rarely activate |
| Confidence honesty | Whether High forecasts are more concentrated and more predictive than Medium/Low out-of-sample; simulated optimality of honest selection | Kernel widths or clipping need retuning |
| Point fairness | Dispute rate, negative balances, floor hits, comprehension | Signed points feel unfair or volatile |
| Scoring engine | Behavior under honest/correlated/adversarial simulated judges | Rewards conformity or coordination |
| Skill percentile | Stability under new assessments and model versions | Too noisy to display |
| Deal discovery | Free vs paid reveals, broker click-through, value-first path usage | Buyers do not value the crowd-informed link |
| Exposure cost | How often a user who browsed Find Deals later tried to value an exposed listing | Gate copy or value-first path unclear |
| Third-party sources | Listings ingested, complaints received, removal turnaround | Ingestion policy is unsustainable |
| Evidence-count comprehension | Whether reveal rates and stated trust fall with lower counts | Thin figures are treated as authoritative |

### 17.3 Essential experiments

1. **Input:** one number + confidence vs a range field, measuring dropout and completion time; keep the one-number flow unless evidence says otherwise.
2. **Confidence:** tune `σ_c`, `σ_obs`, `d0`, `z_ref` so that in simulation the honest confidence choice maximizes expected points for agents with varying true uncertainty; measure the distortion from symmetric clipping.
3. **Prior:** compare ask-only, model-only and blended priors (`w`) against held-out independent forecasts; tune `w` and the multiple table.
4. **Scoring:** blind simulations with known latent EV; adversarial trials (sybils, coordinated judges, copycats, late contrarians).
5. **Economy:** 3 starting points, free-below-3 reveals, 1 point at 3+, cap scale 10, newcomer floor −3; measure circulation and negative-balance rates.
6. **Find Deals gate:** test gate copy and the value-first prompt for whether users understand the exposure trade.
7. **Evidence labeling:** test caption variants for the count.

### 17.4 Minimum launch gates

- Operator listings fully loaded; invite links from the buyer flow open the correct valuation form and record eligibility.
- Excluded-source check works; BizBuySell URLs never reach extraction; removal-on-complaint process tested end to end.
- 3 starting points; free reveals below 3; 1-point reveals at 3+, transactional; floor behavior correct; negative balances never revoke earlier unlocks.
- Caps shown before submission, identical across confidence levels; Value queue sorts on cap and count without leaking direction.
- Find Deals writes exposure before returning any row; API parity verified.
- Every crowd figure carries its count on every surface and in every API response.
- Scoring passes honest-confidence optimality and adversarial checks in simulation; labeled peer-predictive.
- No promotional claim that a score is verified accuracy or that a model EV is an offer.

---

## 18. Failure cases and acceptance tests

1. **New verified user:** Balance exactly `3`. Can reveal three listings with 3+ valuations, and any number of listings below 3 (rate-limited), without valuing anything.
2. **Invited buyer:** a request (name, email, listing URL) creates the account if needed and emails the link; opening it signs the buyer in with no other step and opens that listing's valuation form; no crowd figure shown before submission; forecast tagged `information_level = cim`; counts toward `n_ind`.
3. **Nonvalued listing:** Appears in Value queue with cap ±10 and “Independent valuations on file: 0.” In Find Deals it appears with “No independent valuations yet,” ranked by fit, reveal free.
4. **Low confidence selection:** Same possible score as Medium/High; wider assumed range displayed; broader kernel stored.
5. **High confidence selection:** Same possible score; narrower range displayed; narrower kernel stored; a later report two Medium-widths away yields a larger loss than it would have under Medium.
6. **Honest-choice simulation:** For agents whose true uncertainty matches each kernel width, the matching choice yields the highest expected points under the versioned parameters.
7. **Implied multiple:** Typing an EV shows “= x.x× SDE/EBITDA” instantly; omitted when earnings unknown.
8. **Ten prior reports:** Cap declines; user can sort by cap or by fewest valuations.
9. **New qualified forecast arrives:** Earlier scores recomputed; each change posts exactly one signed delta; new report starts at 0; `n_ind` increments by one in the sealing transaction.
10. **Newcomer floor:** Three early forecasts turn negative totaling −5.2; posted total is −3; a later +1.5 revision restores the clipped 1.5 before raising the balance.
11. **Previously spent points:** Negative adjustment takes the account to `−0.4`; unlocked URLs still open; paid reveals blocked until `≥ 1`; free reveals still allowed.
12. **Find Deals render:** Each returned row has an exposure event timestamped before the response; unreturned pages are not exposed; a scored forecast on an exposed listing is rejected server-side.
13. **Find Deals gate:** Shown once per session before any row is returned.
14. **Reveal free:** Listing with 2 valuations; `URL_REVEAL_FREE` recorded, balance unchanged; the listing later reaches 3 and the user is not charged.
15. **Reveal paid:** Listing with 3 valuations; 1 point charged atomically; reopen free; failure to deliver link refunds.
16. **Value first, then reveal:** User values a listing in the Value queue, sees the crowd figure and count on post-submission, reveals (free or paid); the forecast remains scored.
17. **Participant pastes a broker URL:** Not excluded; facts parsed; count shown; valuation offered; scored if not exposed; no reveal charge for the submitter.
18. **User pastes a BizBuySell URL:** Rejected before extraction; no forecast under that record.
19. **Duplicate listing URL:** Same canonical business/snapshot; no second scoring opportunity, no second reveal, no second count increment, no reset of exposure.
20. **Broker complaint:** Listing marked removed within SLA; no new displays, reveals or forecasts; existing unlocks honored; prior scores unchanged; audit preserved.
21. **Only one respondent:** Numeric figure published “Based on 1 independent valuation”; identity never shown.
22. **Two conflicting responses:** Both stored; pooled figure “Based on 2 independent valuations · preliminary” with prominent disagreement; reveal still free.
23. **Related accounts:** Two accounts in one organization cluster value the same snapshot; `n_ind` increments once; the second is flagged `counts_toward_independent = false`.
24. **Voided forecast:** Admin voids for collusion; `n_ind` decrements through a recorded event; dependent scores recomputed; counts agree on every surface.
25. **Percentile with too little evidence:** “Not enough evidence”; no public leaderboard.
26. **Future asking-price change:** New snapshot with `n_ind = 0`; prior snapshot keeps its count and caps.
27. **Economics undefined:** SDE ≠ EBITDA, unknowns shown; the ask is always EV, so `EV/ask` and `Pr(EV > ask)` are never suppressed for basis reasons.
28. **New listing URL in a request:** the listing is onboarded before anything else; if extraction is complete it is approved and the email goes out; if not, the request is held, the listing appears in Admin > Review, and approval sends the email automatically.
29. **Same buyer, several listings:** one account; one request and one link per listing; valuing one listing does not affect the others.
30. **Repeat or retried message:** the same request ID returns the earlier result; a second message for an open request sends nothing unless it asks for a resend, which replaces the link.
31. **Link opened by an email scanner first:** the buyer's later click still works until expiry.
32. **Later sign-in:** the buyer can sign in with an email link at any time, or with a password after setting one in Account.
33. **Already valued or exposed:** no email is sent and the caller is told why.

---

## 19. Build sequence and explicit priorities

### Stage 0 — Foundations

Register PriceAFirm.com. Build the multiple table from the operator's deal history. Test the one-number form with real deal reviewers. Implement the simulation harness (known latent EV, correlated judges, delayed reports, strategic agents) and prove honest-confidence optimality under the chosen parameters. Define the independence rule that drives `n_ind`. Counsel reviews the NDA permission language for operator listings, the seller disclosure, and the permissionless ingestion policy.

### Stage 1 — Operator listings and the sparse-participation loop

Verified accounts, 3-point grant, newcomer floor, operator catalog, automated valuation requests from the buyer-qualification system (API, URL onboarding, auto-created accounts, auto-login links, password option), **Value businesses** queue with caps and counts, EV + confidence form with implied multiple, immutable snapshots, model prior, opinion pooling with transactional `n_ind`, post-submission view with figure, count and reveal. Scoring shadow-run.

### Stage 2 — Find Deals and third-party ingestion

Natural-language search, session gate, identifiable rows with exposure-on-render, free/paid reveals, user-submitted URLs with exclusion checks, complaint handling and removal, admin tooling including voids.

### Stage 3 — Live signed points and private skill percentile

Enable live deltas to the single balance once simulations pass; add the private percentile when evidence thresholds are met.

### Stage 4 — Later (not MVP)

Unlisted businesses using the same `businesses` table with no ask (owner-side workflow), verified-valuer opt-in, listed-price monitoring, and, if ever desired, an outcome-based scoring channel; none are in scope now.

---

## 20. Rationale and tradeoff register

| Decision | Why it's chosen | Cost / open question |
|---|---|---|
| Single value + 3 confidence choices, properly scored | Lowest cognitive cost that still elicits calibration; honest choice is optimal | Three widths are coarse; kernel parameters are assumptions |
| Caps by coverage only, identical across confidence | Keeps the confidence choice undistorted; cap is the one number seen before deciding | Users may expect “High = bigger range”; copy must explain |
| Proper log score vs crowd baseline, not marginal mixture improvement | Mixture scoring was not incentive-compatible | Score reflects beating the crowd, not improving it; acceptable for MVP |
| Newcomer floor at −3 for first 5 forecasts | Prevents early users from going deeply negative while learning | Slight subsidy; one per real person |
| Model prior blended with the ask | Reduces ask anchoring; works for businesses with no ask | Multiple table must be maintained; `w` is a hyperparameter |
| Ask always treated as EV | Removes an unanswerable field and all basis-compatibility logic | Some asks are equity or asset prices; buyers absorb that in their estimate |
| Automated valuation requests with auto-created accounts and auto-login links | Removes every signup step for the best-informed valuers | A forwarded email lets someone else value as that buyer for 30 days; mitigated by per-buyer links, revoke/resend, and one valuation per account |
| Operator listings first, buyer invites after NDA, no house valuations | Immediate inventory and a natural stream of informed valuers | CIM-informed and listing-only valuers mix; tagged for analysis |
| Permissionless third-party ingestion, removal on complaint | Inventory without a partner program | Legal exposure; mitigated by facts-only, attribution, prompt removal, counsel review |
| Free reveals below 3 valuations, 1 point at 3+ | Price attaches to crowd-informed access; sparse listings stay usable | Fewer point sinks early; free tier must be rate-limited |
| No participation credit | Avoids paying for low-quality numbers | Points are scarce until scoring activates; the 3-point grant and free reveals carry the early period |
| Find Deals = identifiable rows, exposure on render | Simplest rule that fully protects blind elicitation | Browsing costs eligibility; mitigated by the gate and the value-first path |
| Show the count everywhere, numeric figures at any count | Users weigh evidence themselves; no direction leaks in the count | A 1-valuation figure reveals one anonymous opinion; accepted and disclosed |
| No disclosure of identities or individual forecasts | Participant trust | Low-count aggregates still reflect few opinions; the count makes this visible |
| No outcome channel in MVP | Not worth the work now | Scoring remains a proxy; labeled as such |
| Static listing snapshot | Coherent comparisons with minimal engineering | Grows stale; date shown |
| No trading in MVP | No manufactured liquidity or payoff structure | Engagement rests on scoring and discovery |

### Key decisions to validate before public launch

1. Does the simulation confirm honest-confidence optimality across realistic uncertainty levels, and does pilot data show High forecasts are actually more predictive?
2. Does the peer-predictive score reward independent information rather than conformity among later judges?
3. What share of operator-listing buyers accept the invite, and how quickly do listings cross 3 valuations?
4. Does permissionless ingestion generate complaints at a sustainable rate, and does removal work within SLA?
5. Do buyers tolerate the Find Deals exposure trade, and does the value-first path get used?
6. Do users discount low-count crowd figures when the count is displayed?

---

## 21. Research and source notes

- Gneiting, T. & Raftery, A. (2007). *Strictly Proper Scoring Rules, Prediction, and Estimation*. [Journal paper](https://doi.org/10.1198/016214506000001437). Basis for the log-score construction in 6.3; propriety holds for the distribution of the verifying variable, here the later report, not the true EV.
- Peer-prediction mechanism overview: [Mechanisms — Peer prediction](https://mechanisms.microprediction.org/mechanisms/peer-prediction.html). Why peer reports are a proxy and why conformity/collusion equilibria remain a risk.
- [BizBuySell Terms of Use](https://www.bizbuysell.com/terms-of-use/). Restrictions relevant to extraction, database creation and certain links; the basis for the exclusion.

**Final product definition:** PriceAFirm is a **low-friction, blind valuation-contribution and business-discovery network** seeded with the operator's own listings and their inquiring buyers. Each member starts with **3 points**; each valuation is **one EV estimate plus Low/Medium/High confidence**, scored by a **proper score against later independent reports** within a cap that depends only on prior coverage; the value queue shows neutral facts, the **number of independent valuations on file**, and sorts by **maximum possible points**; every crowd figure is numeric at any count and **captioned by the number of independent valuations behind it**; Find Deals shows identifiable listings and **exposes whatever it renders**; URL reveals are **free below 3 valuations and 1 point at 3 or more**; third-party listings are ingested **without prior permission and removed on complaint**. All of this is subject to the confidentiality and statistical-honesty safeguards described above.
