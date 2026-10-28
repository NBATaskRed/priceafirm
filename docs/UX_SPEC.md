# PriceAFirm UX spec

**Status: DRAFT v1 (Oct 28, 2026), pending owner approval.** Source: the Claude Design canvas "PriceAFirm UX"
(screens: valuation request email, valuation form + locked-in state on phone, My points on phone, Value
businesses, Find deals). Until the owner approves, treat this as the direction, not yet the contract (see
CLAUDE.md "UI and UX").

## 1. Principles
- **One job per screen.** Each screen has one primary action in amber; everything else is quiet.
- **Fun comes from consequence, not decoration.** The points chip, the live value band, the "Locked in" moment and
  score moves carry the energy. No confetti, emoji, gradients or arrows.
- **Plain words.** Buyers' language, not system terms: "Lock in my valuation", "See the broker listing",
  "What buyers think so far", "How sure are you?". No em dashes anywhere. Sentence case. No all-caps labels.
- **Numbers are the heroes.** Money and points are set large in the wide figure face; labels sit small below them.
- **Honest by design.** Every crowd number says how many valuations it rests on and that it is a model estimate,
  not an offer. Possible points are shown before every commitment.

## 2. Tokens
| Token | Value | Use |
|---|---|---|
| ink | `#17181A` | page ground |
| graphite | `#222428` | cards, fact tiles, segmented controls |
| graphite-2 | `#1F2124` / `#1D1E21` | list rows / inputs |
| rule | `#373A3F` (borders), `#2C2E33` (dividers, tracks) | lines |
| paper | `#F2EEE6` | primary text, secondary buttons (filled) |
| paper-soft | `#D8D3CA` | body copy on dark |
| stone | `#A9A49B` | secondary text (passes 4.5:1 on ink) |
| amber | `#F5A524` (text on amber: ink) | the one accent: primary buttons, points, your marker |
| amber-tint | `#2A2418` | points chip ground |
| gain / loss | `#8FD19E` / `#F28B82` | score moves, always with a + or − sign |

Radii: 999 chips; 14 primary buttons (phone) / 12 (desktop); 16 large cards; 12 tiles and inputs; 10 small buttons.
Touch targets at least 44 px (primary buttons 52 to 54 px).

## 3. Type
- **Hanken Grotesk** (400, 500, 600, 700): all UI and copy. Replaces Manrope in the current code.
- **Archivo**, width axis 118, tabular figures (600 to 800): every money amount, multiple, point value and count.
- Scale (px): 64 balance; 40 page titles and the EV input; 32 to 34 hero figures; 26 phone titles and row points;
  19 row titles; 17 section labels and phone buttons; 15 to 16 body; 13 to 14 meta; 12 tile labels.

## 4. Screens

### 4.1 Valuation request email (light, 600 px)
- Subject: "What is [headline] ([metro, ST]) worth to you?". From: "Ashish Bhatt via PriceAFirm".
- Body: greeting with first name; "You've had the materials on **[headline]** in [metro] for a couple of weeks.
  What do you think it's worth?"; "One number and how sure you are. Under a minute. Your number stays private;
  other buyers only see the combined view."
- Fact strip: Asking, Revenue, SDE/EBITDA in the figure face.
- One amber button "Value this business" (signs in). Note: "The button signs you in, no password needed. You'll
  start with 3 points, and good calls earn more."
- Footer: link lifetime and why they got it ("you requested materials on this listing from [broker]").
- Code change needed: `src/lib/mail/templates.ts` copy and the fact strip; sender name via MAIL_FROM.

### 4.2 Valuation form (the core screen; phone first)
Order, top to bottom:
1. Header: wordmark left, points chip right ("3.0 pts", amber on amber-tint).
2. Listing: headline (26), location (stone), three fact tiles (Asking, Revenue, earnings type), then
   "[N] other buyers have valued this so far" (or "No one has valued this yet").
3. "What do you think it's worth?" with a large borderless figure input (40, "$" prefix in stone, amber underline
   on focus); below it "Cash-free, debt-free enterprise value" left and the live multiple "= 3.9x SDE" right
   (omitted when earnings are unknown).
4. **Value band (the signature element).** A track on a log scale around the listing (default ask/3 to ask x 3);
   a grey tick for the asking price; an amber translucent band for the assumed range; an amber dot for the
   number. The band animates width and position (350 ms, ease out; none with reduced motion) as the number or
   confidence changes. Caption: "Grey line is the asking price".
5. "How sure are you?" three equal pills Low / Medium / High (radio group; selected = paper fill, ink text). Live
   copy under it:
   - Low: "we assume roughly $X to $Y. Small gains, small losses, whatever other buyers say."
   - Medium: "we assume roughly $X to $Y. You earn more when later valuations land near yours."
   - High: "we assume roughly $X to $Y. Biggest gains if later valuations land near yours, biggest losses if they don't."
   Range = value / k to value x k, k = exp(1.2816 sigma), sigma 0.55 / 0.35 / 0.22.
6. Pinned bottom: tile "Points at stake ±C" (same for all levels), amber button "Lock in my valuation".
- Terms acknowledgement (first valuation only) sits above the button as one checkbox line.
- Bounds changed while open: replace the stake tile with "Points at stake changed to ±C because another buyer just
  valued this" and require a second tap.

### 4.3 Locked in (same route after submit)
- Amber circle with a check that scales in once (the single orchestrated motion); "Locked in"; "You said $2.65M,
  medium confidence".
- Card: "Your score for this business" 0.0 large; "It moves up or down as other buyers value this business,
  anywhere between −C and +C."
- "What buyers think so far": median value large; a band (P10 to P90) with the ask tick and your dot; two tiles
  (x of the asking price; chance it's worth more than ask); "Based on N independent valuations, yours included.
  Model estimates, not offers."
- Primary: "See the broker listing (free)" when the count is below 3, "(1 point)" at 3 or more (the buyer's own
  valuation counts). Secondary: "Value another business".

### 4.4 Value businesses (desktop; stacks on phone)
- Title and lede: "Say what a business is worth and earn points when other buyers agree later. The fewer
  valuations a listing has, the more points are at stake."
- Segmented sort: Most points / Fewest valuations / Best fit for me. Filters: Industry, State, Earnings at least.
- Rows (not cards): headline + location; Asking / Revenue / earnings facts; right side "±C" large in amber with
  "No valuations yet" or "[N] valuations so far"; button "Value it" (paper fill).
- Footer line: "Nothing here shows what other buyers think, so valuing stays blind. You'll see the combined view
  right after you lock in your number."

### 4.5 Find deals (desktop)
- **Gate** (once per session, before any row is returned): "Before you look"; "Listings here show what other buyers
  think they're worth. Once you've seen a listing here, valuing it can't earn you points."; "Want points and the
  deal? Value it first in Value businesses. You'll see the buyers' view right after."; buttons "Show me deals"
  (amber) and "Value businesses first".
- Search: one plain-language input plus "Search"; chips under it after "We read that as".
- Results line: "[N] matches, best value for the price first" and "Model estimates from buyers' valuations, not offers".
- Row card: headline, location, facts; crowd block with "1.23x" large (amber when 1.00x or more) "buyers' value vs.
  asking price", a thin bar plus "78% chance it is worth more than ask", and the count line ("Based on 1 independent
  valuation", "Based on 2 independent valuations, preliminary", "Based on N independent valuations"). With zero:
  "No independent valuations yet. Value it first and you'll see the buyers' view as it forms."
- Reveal button "See the broker listing" with a note below: "Free, fewer than 3 valuations" / "1 point" / "Needs 1
  point"; once opened it becomes outlined "Open broker listing" with "Yours to reopen any time".

### 4.6 My points (phone)
- Balance 64 in amber; "points, enough to open N well-valued listings".
- Three tiles: valued, listings opened, earned so far.
- "Recent moves": one row per change with plain reasons ("A new buyer landed close to you" +2.7, "A new buyer landed
  far from you" −1.1, "Opened the broker listing" −1.0, "Locked in, waiting for other buyers" 0.0).
- "Beginner's protection": five-segment meter; "3 of your first 5 valuations used. Until then, you can't lose more
  than 3 points in total on them."
- Skill rank: "Ready after 5 scored valuations (2 so far)" until sufficient, then "78th percentile, provisional".
- Phone bottom nav: Find deals, Value, Add URL, Points (current in amber).

## 5. Naming (use everywhere, including emails and errors)
- Unlocking a URL = "See the broker listing"; unlocked = "Opened listings" (nav).
- Submitting = "Lock in my valuation"; state = "Locked in".
- Crowd = "buyers" / "what buyers think"; never "the crowd" in UI.
- Score = "your score" / "points at stake"; never "accuracy".

## 6. Open items for the owner
- Approve this spec (then it becomes the contract for Claude Code).
- Screens not yet drawn, to follow the same rules: sign-in, Add a listing, Opened listings, Account, Admin.
