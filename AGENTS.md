# AGENTS.md — Meter Inspection Register

Google Apps Script web app (single spreadsheet + mobile web form). No
npm, no build, no test framework. Two source files ARE the product:
`apps-script/Code.gs` (server) and `apps-script/Index.html` (client,
loaded by `doGet()` — the HTML file must be named exactly `Index` in the
Apps Script editor).

## Architecture invariants (break these and lookups silently fail)

- **Three normalization implementations must stay in lockstep**:
  server `normalizeKey_()` (Code.gs), client `normKey()` (Index.html),
  and the sheet formulas (month-tab key col AB + `_Keys` mirror, built in
  `refreshKeys_`/`autoFormulas_`). All are `letters/digits only,
  lowercased`. Change one → change all three.
- **Master column indexes are hard-coded in several places**:
  `masterHeaders` (CONFIG), `getBootstrap` is gone — Master readers are
  `meterDetailsByRow_`, `masterHealthCheck`, `computeWarnings_` drift
  check, and `_Keys` formulas (Master A..T; A=RR, B=Account). Reorder
  Master → update every reader.
- **Meter index** (`METER_INDEX`): RR/Account keys sharded into 128
  CacheService keys, namespaced `r:`/`a:` (never collide an Account with
  an RR). Freshness stamp = Master `getLastRow()` raw — NOT clamped to
  `maxMasterRows` (clamping saturates and misses changes). In-place RR
  swaps (same row count) need `invalidateMeterIndex_()` — called by
  `refreshCheckFormulas` and `setupWorkbook`.
- **`buildMaster_` migrates in place** when Master has data (never
  wipe); throws on unmapped custom columns instead of dropping them.
- **Month tab fixed layout**: cols A..AI (1..35) + dynamic config cols
  from 36 (AJ). The Consolidated QUERY stacks brace blocks of equal
  width — dynamic columns must be appended in lockstep on every tab or
  it breaks.
- **Duplicate-RR handling**: first occurrence wins in lookups; duplicate
  Account IDs get `ambiguous: true` on a SEPARATE object (never mark the
  RR key of the same meter).
- `SpreadsheetApp.getUi()` fails from the editor Run button — use
  `uiAlert_(ss, msg)` for alerts in `setupWorkbook`-style functions.
  Menu-driven functions can keep direct `getUi()`.

## Verify (no test runner — do this before every commit)

```cmd
copy "apps-script\Code.gs" "%TEMP%\opencode\Code.js" && node --check "%TEMP%\opencode\Code.js"
```
Extract the inline script from Index.html and `node --check` it too:
`node -e "const fs=require('fs');const h=fs.readFileSync('apps-script/Index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g)||[];let a='';m.forEach(s=>{a+=s.replace(/<\/?script>/g,'')+'\n';});fs.writeFileSync(process.env.TEMP+'\\idx.js',a);"` then `node --check "%TEMP%\idx.js"`.

Behavioral tests live in `%TEMP%\opencode\test_*.js` per session (not
committed) — pattern: eval-extract functions from Code.gs with mocked
`CacheService`/`SpreadsheetApp`/`getRange`. Reuse this pattern for
index/migration/formula logic; it catches real bugs (stamp saturation,
ambiguity contamination).

ES5 only (Apps Script V8 runtime is available but the codebase style is
`var` + `function`, `console`-free) — do not introduce `let`/`const`/
arrow functions in .gs/.html script blocks.

## Workflow (user's standing instruction)

changelog → commit → push. Every change gets a CHANGELOG.md entry under
`## [Unreleased]` in the matching section (Added/Fixed/Changed) with
the same bullet style as existing entries, then conventional-commit
message matching the repo's (`feat(scope):`, `fix(scope):`,
`perf(scope):`, `docs(changelog):`), then push to `main`. Never commit
without the changelog entry; never push without committing.

`CONFIG.version` (Code.gs line ~25) is bumped on every user-facing
change and shown in the form footer — bump it as part of the change,
don't leave it to the user.

## Deploy reality (docs describe it, but agents miss the order)

Paste updated Code.gs + Index.html into the Apps Script editor →
`setupWorkbook` once (safe: migrates Master in place, creates missing
tabs) → menu *Meter Register > Refresh check formulas (all months)*
after Master-structure changes (rewrites `_Keys` AND invalidates the
meter index) → deploy new version. Same URL, new version = inspectors'
bookmarks keep working.

## Files

- `apps-script/Code.gs` — server: setup, menus, month-tab builders,
  web-app API (`getBootstrap`, `submitEntry`, `lookupMeter`), meter
  index, validation, digest, analytics
- `apps-script/Index.html` — the entire form (inline CSS/JS), offline
  queue in localStorage
- `docs/requirements.md` — spec with decision log D1..D27 (read the
  relevant D-row before changing an established behavior)
- `docs/deployment.md` — step-numbered setup; troubleshooting table is
  the user-facing mirror of the invariants above
- `CHANGELOG.md` — one entry per commit, newest first; the
  documentation of record for behavior changes
- README.md — user-facing overview
