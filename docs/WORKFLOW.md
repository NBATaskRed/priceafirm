# Working across two AI tools (Claude here, ChatGPT/Codex there)

**Rule 1: GitHub is the only source of truth.** Every session, in either tool, starts from the latest `main`
and ends with a commit. Nothing lives only in a chat.
**Rule 2: Decisions live in `docs/DECISIONS.md`.** Either tool appends a line when the owner decides something.
**Rule 3: Every session ends by appending to the "Session log" at the bottom of `docs/HANDOFF.md`:** what changed,
what's verified, what's next.

## Who does what

| Work | Where | Why |
|---|---|---|
| Routine coding: bugs, screens to the approved spec, admin tools, bulk import, refactors | ChatGPT / Codex | High volume, low risk; the spec and tests define "done" |
| Setup and ops: Supabase, Vercel env, Resend, deploys, CI fixes, smoke tests on the live site | ChatGPT / Codex (or owner) | Mechanical |
| Scoring math, points economics, incentive questions, any change touching `src/lib/quant/**` or the money RPCs | Claude (here) | Needs proofs and the exact-propriety tests |
| Product design decisions and design-doc edits (`docs/DESIGN.md`) | Claude | Keeps the rationale coherent |
| New screens or visual changes (canvas, then `docs/UX_SPEC.md`) | Claude | The Design canvas lives here |
| Reviews before turning on live points (`SCORING_MODE=live`) or launching to buyers | Claude | One careful pass, low volume |

Rough split: 85 to 90% of the remaining work is in the ChatGPT column.

## Guardrails ChatGPT must keep (also in AGENTS.md)
- Do not edit `src/lib/quant/**`, the SQL functions `reveal_url`, `submit_forecast`, `post_score_change`,
  `void_forecast`, `remove_source`, or `supabase/tests/smoke.sql` expectations. If a task seems to need it,
  stop and write the question under "Open questions for Claude" in HANDOFF.md.
- UI follows `docs/UX_SPEC.md` and `docs/design/*.dc.html`. Anything not covered goes under "UI added pending design".
- CI must stay green: lint, typecheck, `npx vitest run`, build, database smoke test.

## Cheap Claude sessions (to save credits here)
1. Batch questions: let ChatGPT collect "Open questions for Claude" in HANDOFF.md; bring them here together.
2. Start with: "Pull the repo, read HANDOFF.md 'Open questions for Claude', answer and fix only those, commit,
   append to the session log, then stop." Name the exact files if you can.
3. Avoid asking Claude for routine coding, long builds or setup.
4. To give Claude the repo: start a Claude Code session on the GitHub repo, or attach the latest zip.

## Prompt templates

**Start a ChatGPT/Codex session**
> Read AGENTS.md, docs/HANDOFF.md (latest Session log entry and Remaining list), docs/DECISIONS.md and
> docs/UX_SPEC.md. Do the next item: [ITEM]. Keep CI green, do not touch the guarded files, commit, and append a
> Session log entry. Put any scoring, points or design question under "Open questions for Claude" instead of guessing.

**Start a Claude session**
> Pull NBATaskRed/priceafirm. Read docs/HANDOFF.md "Open questions for Claude" and the latest Session log entry.
> Handle only those questions [or: this design/math task], commit, append a Session log entry, and stop.

**Hand back after a design change (Claude)**
> Update docs/UX_SPEC.md and docs/design/, add a DECISIONS line, and list the screens ChatGPT must update.
