# Changelog

All notable changes to this project. One entry per commit, newest first
(generated from `git log`; oldest commit documented at the bottom).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- **RR hard-block is now case-insensitive** (`apps-script/Code.gs`):
  - `validatePayload_` matches the submitted RR Number against `Master!A`
    case-insensitively; the stored row uses Master's canonical casing, so
    history stays consistent regardless of how the inspector typed it.
  - `computeWarnings_` history-max (CKWh below all-history max) and
    duplicate-entry checks now also compare RR case-insensitively, so
    case-variant history is no longer silently missed.
  - `apps-script/Index.html`: the meter-info card lookup (`onRR`) resolves
    case-insensitively too — typing a case-variant RR still shows
    Make/Serial/Constant/Phases.
  - Not yet aligned: the ⚠-Checks **sheet formulas** (COUNTIFS/MAXIFS in
    `autoFormulas_`) remain case-sensitive.

## [1.0.0] — 2026-08-25

### Added — docs: note - refresh Apps Script tab if function dropdown is empty
- `9958d1f` — `docs/deployment.md`: warning note under the paste step — if
  the function dropdown (right of *Debug*) doesn't list `setupWorkbook`,
  close the Apps Script browser tab entirely and reopen
  `Extensions → Apps Script`; the dropdown often needs a refresh after a
  big paste. Matching row added to the troubleshooting table.

### Added — docs: step-by-step deployment guide with troubleshooting
- `f38018d` — new `docs/deployment.md`: end-to-end one-time setup for the
  consolidator (create workbook → paste `Code.gs` + `Index` HTML → run
  `setupWorkbook` with permissions → fill `Team`/`Master` → deploy the web
  app with *Execute as: Me* / *Anyone with a Google account*), a
  pre-announce verification checklist (authorized user, unauthorized user,
  test entry, airplane-mode offline queue test), the future-updates
  routine (same deployment, new version — URL never breaks), and a
  symptom→fix troubleshooting table.

### Changed — docs: web app deployment and onboarding guide
- `3957b90` — `README.md` rewritten around the web-app workflow:
  "How it fits together" ASCII diagram (phone → Web App → month tab;
  consolidator → Sheet directly); setup now includes creating the `Index`
  HTML file and deploying as Web app; "Do not share the Sheet itself with
  inspectors"; month-start requires nothing (tab auto-created by first
  submission); new *Validation* section (hard-blocks vs ⚠ flags) and
  inspector field tips (Add to Home screen, pre-filled Date/Time, offline
  queue with yellow bar, "Not authorized" meaning).

### Added — feat(ui): mobile inspection form with offline queue
- `ee325c3` — new `apps-script/Index.html` (268 lines): single-page
  mobile-first form served by `doGet()`.
  - Boot flow: `getBootstrap()` → shows "Not authorized" when the login
    email isn't in `Team`; otherwise renders the form with the inspector's
    name in the header and an RR Number datalist (labelled by spot + make).
  - Date/Time pre-filled with device now (editable); picking an RR shows a
    live meter-info card (Make, Serial, Constant, Phases, Spot).
  - Required: Date, Time, RR, CKWh, Pr kW; optional: B1–B6 kWh/kW, PF,
    Remarks (200 chars).
  - Offline queue: failed/offline submissions are stored in
    `localStorage` (`mrq_v1`), a yellow queue bar shows the pending count,
    and entries auto-retry every 30 s / on `online` event, keeping their
    spot-time Date/Time. Toast feedback on every outcome.

### Changed — feat(api): team-email auth, submit API, month auto-create for web entry
- `35cd92f` — `apps-script/Code.gs` reworked from the v1.1 direct-Sheet
  generator into the v2.0 web-app backend (implements spec v2.0, D16–D20):
  - `doGet()` serves `Index` HTML as a mobile web app.
  - `currentUser_`: login email must exist in `Team` (email+name columns)
    — identity for "Entered By"; no impersonation, no typed names.
  - `getBootstrap()`: authorization check + serves Team/Meter reference
    data (meters list for the dropdown) to the form.
  - `submitEntry(p)`: server-side hard-block validation
    (`validatePayload_` — required fields, date/time/RR formats, unknown
    RR in Master, PF 0–1, no negatives, remarks ≤ 200 chars), month tab
    auto-created from the entry's Date if absent, appends via
    first-empty-row under `LockService` (script lock, 10 s) so concurrent
    phones can't collide, and returns row number + warnings.
  - `computeWarnings_`: mirrors the ⚠-Checks flag rules for instant
    in-form feedback — CKWh below all-history max, block-sum ≠ total
    within ±1 kWh, duplicate RR+Date+Entered By (sheet formulas re-check
    anyway).
  - Team tab now Email + Name (was a single "Entered By" name column);
    month-tab validations loosened to `setAllowInvalid(true)` for RR/By
    (server enforces); duplicate/wrong-month/wrong-RR handling adjusted
    for the new write path.

### Changed — docs: spec v2.0 - web-form entry via Apps Script web app
- `139fe18` — `docs/requirements.md` v1.2 → v2.0: platform is now Sheet +
  Apps Script Web App (inspectors never open the Sheet); inspector role is
  web-form-only with no Sheet edit access; file-governance §3.1 rewritten
  (inspectors only know the web-app URL — stray copies practically
  impossible; onboarding = add Email to Team tab); "Entered By" resolved
  from Google login email; Date/Time pre-filled in the form; month tab
  auto-created by first submission OR menu; hard-blocks enforced
  server-side in the web app on Submit; new §7 Entry web app
  (mobile-first page, bootstrap, offline localStorage queue with
  auto-retry, deployment steps); corrections only by consolidator.
  Decision log additions: D16–D20.

### Added — docs: one-time sharing and mobile onboarding steps
- `eb1af37` — `docs/requirements.md` + `README.md`: per-member onboarding
  steps (share once via Gmail invite → file appears under *Shared* → star
  it for one-tap access; optional Add to Home screen). *(Superseded by
  the v2.0 web-app model in `139fe18`.)*

### Added — docs: file governance rules for single shared workbook (spec v1.2)
- `a6c751f` — `docs/requirements.md` v1.1 → v1.2: new §3.1 File
  governance — single source of truth (only the consolidator creates the
  workbook; "Editors can change permissions and share" OFF; one canonical
  pinned URL; monthly Drive search must return exactly one file; the
  bound *Meter Register* menu doubles as an authenticity test; offline
  work happens on the shared file itself). README setup step 6 added.
  Decision D15. *(Superseded by the v2.0 web-app model in `139fe18`.)*

### Changed — docs: setup and monthly workflow guide in README
- `7b03e42` — `README.md` grown from a placeholder into the project
  guide: fields captured, validations summary, tabs table, one-time
  setup (Sheet → paste `Code.gs` → `setupWorkbook()` → fill Team/Master →
  share as Editor), monthly routine (New month sheet / Close month +
  XLSX archive / Unlock for corrections), field tips. *(Reflects the
  pre-web-app v1.x workflow.)*

### Added — feat: Apps Script generator for month-tab meter register workbook
- `5fe182e` — new `apps-script/Code.gs` (325 lines, spec v1.1): workbook
  generator + consolidator menu.
  - `setupWorkbook()` / `rebuildWithConfirm()`: build/rebuild `Master`
    (RR, Constant, Make, Serial, Phases, Spot/Feeder + 2 RR-SAMPLE rows),
    `Team`, current month tab and `Consolidated`.
  - *Meter Register* menu: New month sheet… (YYYY-MM template with 1 000
    pre-filled formula rows), Close month (sheet protection lock),
    Unlock month, Refresh Consolidated, Rebuild all sheets.
  - Month-tab template: manual entry columns A–T, auto columns U–Y
    (Constant/Make/Serial/Phases VLOOKUPs + Month), Z = ⚠ Checks formula
    (unknown RR, PF missing/out of range, CKWh below history via MAXIFS
    on Consolidated, date not in this month, duplicate via COUNTIFS);
    data-validation dropdowns (RR from Master, Entered By from Team, PF
    0–1 reject, date required); protected header/auto columns.
  - `Consolidated`: live QUERY stacking all month tabs A2:Y + Source Tab
    column, newest first; protected read-only.
  - `Team` tab: single "Entered By" name column (v1.1 model).

### Added — docs: requirements spec for digital meter inspection register
- `659854c` — new `docs/requirements.md` (v1.1): problem statement
  (paper registers → monthly manual consolidation), platform (single
  Google Sheet, no backend/photos), roles & access, workbook structure
  (Master / Team / one tab per month / live Consolidated, 1 000 rows per
  month, month lifecycle with lock + XLSX backup), data captured per
  inspection row, validation rules (2 hard-blocks, 5 ⚠ flags), corrections
  policy, fresh-start history, non-goals, decision log D1–D14.

### Added — repo bootstrap
- `c0dfd21` — `.gitignore` (`__pycache__/`, `*.py[cod]`).
- `3726542` — README typo fix (`test_check_resgister` →
  `test_check_register`).
- `57cca3d` — initial `README.md` placeholder ("test_check_resgister").

[Unreleased]: https://github.com/Shreyasss91/test_check_register/compare/9958d1f...HEAD
[1.0.0]: https://github.com/Shreyasss91/test_check_register/commits/9958d1f
