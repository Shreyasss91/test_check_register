# Changelog

All notable changes to this project. One entry per commit, newest first
(generated from `git log`; oldest commit documented at the bottom).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Meter status field** (`apps-script/Code.gs`,
  `apps-script/Index.html`, `docs/requirements.md`):
  new dropdown — OK / Defective / Seal broken / Meter stopped / Burnt /
  Not accessible — replacing free-text cramming in Remarks. Defaults to
  OK; stored in month-tab column U; the value list comes from
  `CONFIG.meterStatuses` via `getBootstrap` (server-validated on
  submit).
  - **Schema shift** (column layout only, no data loss on upgrade):
    Meter Status is column U; Master lookups move V..Z, ⚠ checks AA,
    RR key AB, spot details AC..AI; Consolidated stacks A..Z + AB..AI +
    Source Tab (35 cols).
  - Month-tab U gets a value-list data validation; existing tabs are
    upgraded via *Refresh check formulas (all months)*.

- **Master health-check menu item** (`apps-script/Code.gs`, README):
  new *Meter Register > Master health check…* audits the Master tab and
  reports what the form silently tolerates today:
  - **Duplicate RR Numbers** (normalized-key collision — the resolver
    takes first occurrence, so dupes weaken lookups) with row numbers.
  - **Duplicate Account IDs** (the form rejects these as "ambiguous" at
    submit — better caught early) with row numbers.
  - **Blank compulsory fields** per column (Account ID, MRID, MD DAY,
    SF, Name, Constant, Make, Serial, Phases, DTC, Feeder, Location)
    with per-field counts.
  - Leftover **RR-SAMPLE** rows.
  Clean result: "No problems found — Master is clean. ✓". README's
  monthly routine mentions it.

- **Month-tab capacity alert** (`apps-script/Code.gs`,
  `apps-script/Index.html`):
  - At ≥ 90 % of the 1 000-row budget, `submitEntry` appends a
    `capacity` note to the response; the inspector's toast shows
    *"month tab near capacity (900/1000 rows)"* (red when critical at
    999).
  - The consolidator gets a **one-time email per month tab** (MailApp,
    script-property flag prevents repeats) telling them to extend the
    tab or close the month. Email is best-effort — a mail failure never
    blocks the submit.

- **Deployed-version stamp** (`apps-script/Code.gs`,
  `apps-script/Index.html`, `docs/deployment.md`):
  new `CONFIG.version` (starts at `v1.5.0`) is served by `getBootstrap`
  and rendered in a small footer line in the form ("Meter Register
  v1.5.0"). Solves the top troubleshooting row instantly — inspectors
  and the consolidator can *see* which deployment is live instead of
  guessing whether a new version was published. Deployment guide now
  says to bump the version on every release.

- **Offline-queue poison-pill fix** (`apps-script/Index.html`):
  a server-rejected head entry (e.g. unknown RR after a Master cleanup)
  used to halt `syncQueue` forever, stranding every entry behind it.
  - Rejected entries are now **parked in a separate failed list**
    (`localStorage: mrq_failed_v1`) with the server's reason; the live
    queue drains past them automatically.
  - Yellow bar shows both counts ("2+1 held") and a rejected note
    ("N rejected — tap to retry"); tapping the bar re-queues held
    entries for one more round (fix the cause first, e.g. RR added back
    to Master).

- **Spot-vs-Master drift flag** (`apps-script/Code.gs`):
  - `_Keys` mirror extended to 8 columns (adds DTC / Feeder / Location
    from Master K–M) so all seven spot-entered fields have a Master
    counterpart to compare against.
  - ⚠-Checks formula gains a per-field drift test: any filled Spot-*
    column (AB..AH) that disagrees with `_Keys` flags **"Spot≠Master"** —
    stale Master data now surfaces automatically on the row itself.
  - `computeWarnings_` mirrors the same rule server-side (normalized RR
    row lookup, field-by-field diff) so the inspector sees
    *"Spot details differ from Master (make, dtc)"* in the submit toast
    and can report it immediately.

- **Clearer not-authorized message with the login e-mail**
  (`apps-script/Code.gs`, `apps-script/Index.html`, README):
  - `getBootstrap` now returns the visitor's login e-mail alongside
    `not_authorized`; the form displays: *"Your e-mail
    you@example.com is not in the Team list. Ask the admin to add your
    e-mail to the list, or log in with an approved e-mail."* — the
    inspector sees exactly which account to get approved.
  - `submitEntry` rejection (offline-queued entries from removed
    members) uses the same wording; README field-tips line updated.

- **Optional "Meter details" collapsible section in the form**
  (`apps-script/Index.html`, `apps-script/Code.gs`, docs):
  - Same pattern as *Block readings*: a closed `<details>` under the
    RR/Account row that expands to 7 inputs — Meter Constant, Make,
    Serial No, Phases, DTC, Feeder, Location.
  - Fields are **pre-filled from Master** when the RR/Account resolves
    (switching meters re-fills; the inspector's own edits are kept), so
    the usual flow is just verify-and-submit; corrections can be typed
    at the spot.
  - Stored in **separate Spot-* columns** (AB..AH: Spot Constant, Spot
    Make, Spot Serial No, Spot Phases, Spot DTC, Spot Feeder, Spot
    Location) — Master auto-lookups (U..Y) are untouched, so spot-entered
    values vs Master can be compared later. Only fields with a value are
    written (≤ 50 chars each, server-enforced).
  - `Consolidated` now stacks the Spot columns + RR Key + Source Tab
    (34 cols); `Refresh check formulas (all months)` adds the new
    headers/columns to existing month tabs (data preserved); upgrade
    notes in README/deployment guide updated.

### Changed

- **Submit UX: toast + full form clear on every path**
  (`apps-script/Index.html`):
  - Online success: toast now says "Saved ✓ row N (month) — form
    cleared for next entry" (plus any ⚠ warnings); all fields emptied,
    Date/Time re-prefilled to now. *(existed)*
  - Offline submit: entry is queued **and the form is cleared** with a
    confirming toast — previously the fields stayed filled, inviting
    accidental double submission of the same reading.
  - Send-failure (server unreachable mid-submit): entry queued for
    auto-retry, form cleared with a clear message — same double-entry
    protection.

- **⚠-Checks sheet formulas normalized** (`apps-script/Code.gs`, docs):
  previously only the server-side (JavaScript) checks ignored case and
  spaces — the in-sheet ⚠ column formulas (unknown-RR `COUNTIF`,
  history-max `MAXIFS`, duplicate `COUNTIFS`, Master `VLOOKUP`s) compared
  RR Numbers textually, so hand-edited or legacy rows with variant
  casing/spacing could raise false "Unknown RR" flags or silently miss
  history/duplicate warnings.
  - New hidden **`_Keys` tab** (`refreshKeys_`): auto-generated live
    mirror of Master — normalized RR key plus Constant/Make/Serial/Phases;
    all month-tab lookups go through it.
  - New hidden **key column AA** in each month tab:
    `LOWER(SUBSTITUTE(RR," ",""))`; every check formula compares keys
    instead of raw RR text.
  - `Consolidated` now carries the RR Key column (Z) + Source Tab (AA);
    month-tab history checks match against it.
  - New menu item **Refresh check formulas (all months)**
    (`refreshCheckFormulas`) to rewrite existing month tabs with the
    normalized formulas — new tabs get them automatically.
  - `setupWorkbook`/rebuild handle `_Keys` (created, hidden, protected);
    deployment guide gains the upgrade step; README/spec document the
    hidden tab. *(Shipped in commit `ef5993e`'s follow-up — see git log.)*

- **Enter meter by RR Number *or* Account ID** (`apps-script/Code.gs`,
  `apps-script/Index.html`, docs):
  - Either field alone is sufficient (both optional individually, at
    least one required). Form gains an Account ID input with its own
    datalist; the meter-info card resolves from whichever field is
    filled, live as you type.
  - Both fields are matched against `Master` with the same
    normalization: **case-insensitive and all spaces removed** —
    leading, trailing *and* middle ("rr 12 34" = "RR1234").
  - Hard-blocks (server-side, `validatePayload_` + `normalizeKey_`):
    unknown RR · unknown Account ID · Account ID matching multiple
    meters (ambiguous) · both entered but belonging to different
    meters (mismatch).
  - The row always stores the **resolved Master RR Number** (canonical
    casing), so auto-lookups, ⚠ checks, duplicate detection and
    Consolidated grouping keep working unchanged.
  - Docs updated: requirements §5/§6 (hard rule 1), README validation
    section, deployment step 13 (Account IDs must not repeat across
    meters).
  - `resetReadings()` now clears RR + Account ID after a save.

  *(Shipped in commit `ef5993e`.)*

- **Master schema expanded — 14 columns** (`apps-script/Code.gs`,
  `apps-script/Index.html`, docs):
  - New columns after RR Number: **Account ID, MRID, MD DAY, SF, Name**.
  - **Spot / Feeder** split into three columns: **DTC, Feeder, Location**.
    Final layout: RR Number · Account ID · MRID · MD DAY · SF · Name ·
    Meter Constant · Meter Make · Meter Serial No · Phases · DTC ·
    Feeder · Location · Notes.
  - `getBootstrap()` reads Master A–M and sends the new fields
    (`accountId`, `mrid`, `mdDay`, `sf`, `name`, `dtc`, `feeder`;
    Location served via `spot`) to the form.
  - Month-tab auto-lookup formulas re-indexed: Constant/Make/Serial/Phases
    are now Master columns G–J (VLOOKUP indices 7–10).
  - Form: meter-info card shows Name, Account, MRID, MD DAY, SF and a
    DTC/Feeder/Location line; RR datalist labels now use consumer
    Name instead of spot.
  - README, `docs/requirements.md` §4, `docs/deployment.md` step 13
    updated to the new layout.

  *(Shipped in commit `884099d`.)*
  - Migration note: existing workbooks keep the old 7-column Master —
    re-run `setupWorkbook` (or the erasing *Rebuild* menu) after pasting
    the new code, then refill Master.

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

  *(Shipped in commit `cd46be5`.)*

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
