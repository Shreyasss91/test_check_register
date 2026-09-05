# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Google Apps Script web app: a mobile form for monthly meter inspections
that writes to a consolidator-owned Google Sheet. Two source files ARE
the product — there is no build step, no test framework, no bundler.

- `apps-script/Code.gs` — server (setup, menus, web-app API, meter index, validation, digest, analytics)
- `apps-script/Index.html` — the entire form (inline CSS/JS), offline queue in localStorage

For invariants, workflow, and the architecture that *will* silently
break lookups if you violate it, read `AGENTS.md` end-to-end before
touching anything. The summary that matters most:

- **Three normalization implementations must stay in lockstep**:
  server `normalizeKey_()` (Code.gs), client `normKey()` (Index.html),
  and the sheet formulas (month-tab key col + `_Keys` mirror). All are
  `letters/digits only, lowercased`. Change one → change all three.
- **Master column order is hard-coded** across `meterDetailsByRow_`,
  `masterHealthCheck`, `computeWarnings_` drift check, and `_Keys`
  formulas (cols A..T; A=RR, B=Account). Reorder Master → update every reader.
- **`METER_INDEX`** (128 CacheService shards, `r:`/`a:` namespacing) is
  the read path for every RR/Account lookup; freshness stamp is Master's
  raw `getLastRow()` (NOT clamped to `maxMasterRows`). In-place RR
  swaps (same row count) need `invalidateMeterIndex_()`.
- **`buildMaster_` migrates in place** when Master has data (never wipe);
  throws on unmapped custom columns instead of dropping them.
- **Month tab fixed layout** cols A..AI + dynamic config cols from AJ;
  Consolidated QUERY stacks brace blocks of equal width — dynamic
  columns must be appended in lockstep on every tab.
- **Duplicate-RR handling**: first occurrence wins; duplicate Account
  IDs get `ambiguous: true` on a separate object (never on the RR key
  of the same meter).
- ES5 only — `var` + `function`, no `let`/`const`/arrow/`console` in .gs
  or .html script blocks.
- `SpreadsheetApp.getUi()` fails from the editor Run button — use
  `uiAlert_(ss, msg)` in `setupWorkbook`-style functions.

## Verify (no test runner — do this before every commit)

```cmd
copy "apps-script\Code.gs" "%TEMP%\opencode\Code.js" && node --check "%TEMP%\opencode\Code.js"
```

Extract the inline script from Index.html and `node --check` it too:

```cmd
node -e "const fs=require('fs');const h=fs.readFileSync('apps-script/Index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g)||[];let a='';m.forEach(s=>{a+=s.replace(/<\/?script>/g,'')+'\n';});fs.writeFileSync(process.env.TEMP+'\\idx.js',a);" && node --check "%TEMP%\idx.js"
```

Behavioral tests live in `%TEMP%\opencode\test_*.js` per session (not
committed) — pattern: eval-extract functions from Code.gs with mocked
`CacheService`/`SpreadsheetApp`/`getRange`. Reuse this pattern for
index/migration/formula logic.

## Deploy order (after editing code)

1. Bump `CONFIG.version` in `Code.gs` (shown in the form footer) as
   part of the change.
2. Paste updated `Code.gs` + `Index.html` into the Apps Script editor.
3. Run `setupWorkbook` once (safe: migrates Master in place, creates
   missing tabs).
4. If Master structure changed: menu *Meter Register > Refresh check
   formulas (all months)* (rewrites `_Keys` AND invalidates the meter index).
5. Deploy → *Manage deployments → ✏ → New version*. Same URL = bookmarks
   keep working.
6. `CHANGELOG.md` entry under `## [Unreleased]` in the matching
   section (Added/Fixed/Changed), same bullet style as existing entries.
7. Conventional-commit message (`feat(scope):`, `fix(scope):`,
   `perf(scope):`, `docs(changelog):`) — match the repo's history.
8. Push to `main`. Never commit without the changelog entry; never
   push without committing.

## Spec / docs

- `docs/requirements.md` — spec with decision log D1..D27 (read the
  relevant D-row before changing an established behavior)
- `docs/deployment.md` — step-numbered setup; troubleshooting table
  mirrors the invariants above
- `README.md` — user-facing overview
- `CHANGELOG.md` — one entry per commit, newest first; the
  documentation of record for behavior changes
