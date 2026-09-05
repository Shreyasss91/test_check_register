# Changelog

All notable changes to this project. One entry per commit, newest first
(generated from `git log`; oldest commit documented at the bottom).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **`CLAUDE.md` entry-point for future Claude Code sessions** — points
  at the canonical `AGENTS.md` for the deep invariants and surfaces the
  highest-leverage ones inline (normalization-in-lockstep, Master
  column order, `METER_INDEX` stamp semantics, ES5-only, in-place
  Master migration), plus the `node --check` verify commands for both
  `Code.gs` and the inline `<script>` blocks of `Index.html`, and the
  changelog → commit → push deploy order with the `CONFIG.version`
  bump rule.

### Changed

- **Meter lookup re-architected for a 15–30k-row Master**
  (`apps-script/Code.gs`, `apps-script/Index.html`, README,
  `docs/requirements.md`, `docs/deployment.md`):
  - Problem: the form shipped the entire Master to the browser on every
    load — with ~15,000 populated rows the payload was megabytes, the
    meter card resolved slowly or never, and `maxMasterRows = 1000`
    silently capped every Master read: meters beyond row 1000 never
    reached the form, were invisible to the sheet-side `_Keys`
    lookups/⚠ checks, and would even be rejected at submit as
    "Unknown RR".
  - **The form no longer downloads Master.** `getBootstrap` drops the
    `meters` payload (user, version, config lists only); the meter-info
    card resolves through a new `lookupMeter` RPC as the inspector
    types — debounced 300 ms, stale in-flight replies ignored, resolved
    meters memoized per session, and a graceful
    "you can still submit — the server re-checks" message if the
    lookup call itself fails. RR/Account-ID autocomplete datalists are
    gone (they were the 15k-option list bogging the page down).
  - **Server-side sharded key index** (`METER_INDEX`): Master's RR and
    Account-ID columns are read once, normalized, and stored in 128
    CacheService shards (key → { rr, acc, row }, 6 h TTL, ~12 KB per
    shard at 30k rows). A lookup reads exactly ONE shard — no whole-map
    reassembly. A stamp (Master's last row) detects any
    append/delete/clear and triggers a rebuild automatically; shards
    expiring mid-life just rebuild on next use. Full details (Tariff,
    SANC, DOS, …) are read from the single Master row only when the
    card needs them — one 19-cell read instead of 30k×19.
  - **Submits reuse the index**: `validatePayload_` hard rule 1 (RR /
    Account-ID resolution, ambiguity and mismatch checks) and the
    spot-drift check in `computeWarnings_` now go through
    `lookupMeterByKey_` + a one-row read — no more full 30k-row scans
    on every request.
  - `maxMasterRows` raised 1000 → 30000, so every Master read
    (health check, `_Keys` mirror, validation) covers the whole sheet.
  - Index invalidation on the consolidator paths that restructure
    Master without moving the last row: `setupWorkbook` (migration)
    and *Refresh check formulas (all months)* — the documented
    "I edited Master" moment.
  - Version bumped to v1.10.0. Spec: D27; README Master row (30k) +
    field tips; deployment upgrade note + troubleshooting row
    (in-place RR swap → run the refresh menu).

### Fixed

- **`setupWorkbook` crash: "Cannot call SpreadsheetApp.getUi() from this
  context"** (`apps-script/Code.gs`):
  - Symptom: right after the Master-migration run (or any fresh
    `setupWorkbook` from the Apps Script editor's Run button in some
    setups), execution died at the final migration-alert line with the
    exception above. Because it was the **last** statement, the damage
    was zero — Master was already migrated and every tab built — but
    the run reported failure and could scare the consolidator into
    re-running (which is safe, yet confusing).
  - Root cause: `SpreadsheetApp.getUi()` only works when a spreadsheet
    UI is attached to the execution context; the editor's Run button
    doesn't always provide one. `setupWorkbook` is exactly the function
    people run from the editor, so its alert must not depend on `getUi()`.
  - Fix: new `uiAlert_(ss, msg)` helper — tries the UI alert, falls back
    to the Sheet toast, then to `Logger.log` — and `setupWorkbook`'s
    migration notice goes through it. The message can never crash a run
    that already did its work. Menu-driven functions keep their direct
    `getUi()` alerts (a menu click always has a UI).

### Fixed

- **`setupWorkbook` crash: "TypeError: months[0].getParent is not a
  function"** (`apps-script/Code.gs`):
  - Symptom: right after pasting the code and running `setupWorkbook`
    (or *Refresh Consolidated*, or any flow that reaches
    `refreshConsolidated_`), execution died at
    `consolidatedFormula_` with the TypeError above whenever at least
    one month tab existed. On a brand-new workbook with zero month
    tabs it worked by accident (the formula branch is skipped), so the
    bug hid until the first month appeared.
  - Root cause: `monthSheets_(ss)` returns sheet **names** (plain
    strings), but `consolidatedFormula_(months)` treated its argument
    as **sheet objects** and called
    `months[0].getParent()` to get the spreadsheet for
    `configHeadersOnTabs_`. Strings have no `.getParent` — hence the
    TypeError.
  - Fix: `refreshConsolidated_` already computed the canonical dynamic
    config headers (`dyn`, used for the header row and clear width)
    before calling the formula builder, so the value is now passed in
    — `consolidatedFormula_(months, dyn)` — and the broken
    `.getParent()` recompute is deleted. One source of truth, one
    fewer spreadsheet round-trip, and the dynamic-column sequence used
    by the QUERY blocks is guaranteed identical to the header row
    written above them.
  - No data/format impact: the Consolidated QUERY output is unchanged;
    existing workbooks just need the updated `Code.gs` pasted and
    `setupWorkbook` (or *Refresh Consolidated*) re-run.

### Added

- **Master schema v2 — utility-registry reference block + in-place
  migration** (`apps-script/Code.gs`, `apps-script/Index.html`, README,
  `docs/requirements.md`, `docs/deployment.md`):
  - Master grows 14 → 20 columns, reordered to match the utility
    export: RR Number · Account ID · **Tariff** · NAME · **SANC_KW** ·
    **SANC_HP** · **CONT_DEM** · **DOS** · **STATUS** · MR ID · MR DAY ·
    SF · METER CONSTANT · METER_SERIAL_NO · Meter Make · Phases · DTC ·
    Feeder · Location · Notes. Renames: MRID→MR ID, MD DAY→MR DAY,
    Name→NAME, Meter Constant→METER CONSTANT, Meter Serial No→
    METER_SERIAL_NO (single serial column — "Meter Serial No" is gone).
  - **Form meter-info card** now shows Tariff, SANC kW/HP, Cont.Demand,
    DOS and STATUS when an RR resolves (plus MR ID/MR DAY labels
    renamed to match), so inspectors see sanction/demand/status context
    at the spot.
  - **Every index-based Master reader re-mapped** to the new layout:
    `getBootstrap` meters payload (19 cols, new `tariff`/`sancKw`/
    `sancHp`/`contDem`/`dos`/`status` fields served to the form),
    `masterHealthCheck` (18 compulsory fields now include the six new
    columns), the spot-drift check in `computeWarnings_` (Master
    M/N/O/P/Q/R/S), the `_Keys` mirror formulas (B..H now source Master
    M/O/N/P/Q/R/S), and the RR dropdown validation range (A —
    unchanged). Month-tab layout, Consolidated and Analytics are
    untouched (they read month tabs, not Master).
  - **In-place migration** (`migrateMasterInPlace_`, called from
    `buildMaster_`): running `setupWorkbook` on an existing populated
    Master no longer wipes it — the mapping is derived from the actual
    header row (with renames applied), every stored value is carried to
    its new column, and the six new fields start blank for the
    consolidator to fill. A fresh workbook still gets the seeded
    RR-SAMPLE rows (updated to the new layout). No-op when the header
    row is already current, so re-running is safe.
  - Version bumped to v1.9.0. Spec: §4 Master row + §5 new auto-fields
    row + decision D26; deployment guide step 14 + upgrade note; README
    Master row + upgrade note.
  - **Upgrade:** paste both files, run `setupWorkbook` (migrates
    Master, creates Configuration/Guests), then menu *Refresh check
    formulas (all months)*, then deploy a new version.

- **Guest flow — unknown logins are never hard-blocked**
  (`apps-script/Code.gs`, `apps-script/Index.html`, README,
  `docs/requirements.md`, `docs/deployment.md`):
  - A person whose Google login e-mail is **not in Team** can now open
    and use the web app (previously: "not authorized" dead end).
  - **E-mail captured + name asked**: a yellow guest banner explains the
    situation, and a required *Your name* field appears (pre-filled from
    any previous guest visit, `autocomplete="name"`, max 60 chars,
    `{}` rejected so the `Name{email}` format can't be forged/broken).
  - Their entries are written with "Entered By" = `Name{email}` in the
    month tabs — and therefore in the live Consolidated view — keeping
    every entry traceable to a login while they await Team membership.
  - New **Guests tab** (auto-maintained): Email · typed Name · First
    Seen · Last Seen · Submissions — the consolidator's pending list of
    who used the form without being on Team. Built by `setupWorkbook`,
    auto-created on demand for older workbooks (`ensureGuests_`),
    consolidator-protected, included in the Rebuild flow.
  - **Menu > Sync guest names from Team**: after adding a guest's e-mail
    to Team, rewrites all their `Name{email}` rows across every month
    tab to exactly the Team name (guest history merges with their
    future entries in Analytics/digest), and clears their row from
    Guests. Rows whose e-mail isn't in Team yet are left untouched for
    the next run. Consolidated/Analytics need no rebuild — they are
    live views over the month tabs.
  - Weekly digest now groups guests **by e-mail** (stable identity) and
    displays the latest `Name{email}` label — name typos between visits
    no longer split one person into several digest lines.
  - Anonymous sessions (no login e-mail at all) are still refused —
    entries must be traceable to someone.
  - Spec: §5 "Entered By" + §7 entry flow updated; decision log D23
    (guests, not rejections) and D24 (Team sync renames guest rows);
    deployment guide: upgrade note (hard block replaced by guest flow
    on deploy), verify-step now expects the guest banner, two new
    troubleshooting rows; version bumped to v1.7.0.

- **Configuration tab — sheet-driven dropdown lists (zero-code edits)**
  (`apps-script/Code.gs`, `apps-script/Index.html`, README,
  `docs/requirements.md`, `docs/deployment.md`):
  - New **Configuration** tab: one column per dropdown list (row 1 =
    list name, values below). Column A = `Meter Status`, seeded with
    the previous hardcoded six values (order preserved, OK first =
    default). Editing/adding values updates the web-form dropdown and
    every month tab's column-U dropdown **live** — no code edit, re-run
    or redeploy (month-tab validation now uses
    `requireValueInRange` on the Configuration column; the form reads
    the lists in `getBootstrap` on every load; submit validates against
    the live list).
  - **Extra config lists become real form fields and sheet columns:**
    any *other* Configuration column renders as an extra optional
    dropdown in the form ("Additional details" card); the chosen value
    is stored in a dynamic month-tab column (36+ / AJ..) and flows
    into Consolidated (widened QUERY blocks) and Analytics (one new
    "Entries per \<list\>" pivot per list). Add a column in the sheet →
    the form shows the dropdown on next load; the month-tab column is
    created automatically by the next submit, or immediately via the
    new menu item *Meter Register > Apply configuration changes (all
    months)* (also rebuilds Consolidated + Analytics).
  - Dynamic columns are appended **in lockstep** on every month tab
    (canonical sequence = first-seen order on tabs + new list headers),
    which the Consolidated QUERY requires (equal-width brace blocks);
    strictly append-only — removing/renaming a Configuration list keeps
    its stored data column (orphan) on every tab.
  - Fallbacks keep old deployments working: a missing Configuration
    tab/column A falls back to the built-in status list; `setupWorkbook`
    builds the tab, `rebuildWithConfirm` knows it, and
    `refreshCheckFormulas` re-points existing month tabs' status
    dropdowns. `getBootstrap` keeps returning `meterStatuses` for
    compatibility.
  - Form: meter-status select is fully sheet-driven (first value =
    default; no hardcoded `OK`), extra selects are HTML-escaped, and
    `resetReadings()` resets selects to the first option instead of a
    hardcoded value.
  - Spec: D21/D22 added (Configuration-driven lists; dynamic append-only
    columns), §4/§5/§6 updated; deployment guide gains the
    Configuration step + troubleshooting rows; version bumped to
    v1.6.0.

- **Weekly digest email to the consolidator**
  (`apps-script/Code.gs`, README, `docs/deployment.md`):
  - `sendWeeklyDigest()` composes and mails a Monday summary:
    entries in the last 7 days (total + per inspector), all ⚠-flagged
    rows with their flags (month + row + RR + inspector, capped at 30),
    and month-tab capacity (listed at ≥ 70 % used).
  - *Install weekly digest trigger (Mon 8am)* creates the time-based
    trigger (idempotent — removes previous digest triggers first);
    *Send weekly digest now (test)* sends one immediately. Menu
    install is one-time per deployment; troubleshooting row added to
    the deployment guide.

- **Analytics starter tab** (`apps-script/Code.gs`, README,
  `docs/requirements.md`):
  new `Analytics` tab — live QUERY pivots over `Consolidated`, no
  stored data, read-only protected:
  - Entries per inspector (all-time, desc).
  - Entries per month (by Source Tab).
  - Entries per meter status.
  - Non-OK meters needing attention (status + RR, top 25).
  - Spot Feeder / Spot DTC coverage (top 20 each).
  Built by `setupWorkbook`; rebuilt any time via menu
  *Meter Register > Rebuild Analytics tab*. `rebuildWithConfirm` now
  also recreates it. Spec §10 updated — the "analytics deferred"
  stance now points at this starter set.

- **Auto-backup before Rebuild** (`apps-script/Code.gs`):
  *Rebuild all sheets (erases data!)* now saves a full-workbook XLSX
  ("Meter Register FULL BACKUP (date).xlsx") into the "Meter Register
  Exports" Drive folder **before** deleting anything. If the backup
  fails, the rebuild is aborted unless explicitly confirmed to proceed
  unprotected; the completion dialog names the saved backup file.

- **Month export menu item** (`apps-script/Code.gs`, README):
  new *Meter Register > Export month to XLSX (Drive)…* — one-click
  archive of any month tab. Fetches the tab via the Sheets export
  endpoint (single `gid`), saves as
  `Meter Register YYYY-MM (date).xlsx` into a "Meter Register Exports"
  Drive folder (created on first use), and shows the file link.
  Errors surface in a dialog; nothing touches the live tab.

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

- **RR/Account-ID normalization now strips special characters too**
  (`apps-script/Code.gs`, `apps-script/Index.html`, README,
  `docs/requirements.md`, `docs/deployment.md`):
  - Matching previously ignored case and spaces (leading/trailing/
    middle). It now ignores **every non-alphanumeric character** —
    dashes, dots, slashes, hyphens, braces, etc. — so `"RR-12/34"`,
    `"rr 12.34"` and `"RR1234"` all resolve to the same meter
    (letters/digits only, lowercased). Typed, handwritten or legacy
    RR Numbers with stray punctuation can no longer false-flag
    "Unknown RR" or double-count a meter's history.
  - Applied everywhere normalization lives, in lockstep:
    server-side `normalizeKey_()` (hard-block resolution, Master
    health-check duplicate detection, warning checks); client-side
    `normKey()` in the form (live meter-info card, RR/Account
    resolution, config dropdown IDs); the month-tab hidden key
    column AB — now `LOWER(REGEXREPLACE(RR,"[^A-Za-z0-9]",""))` —
    and the hidden `_Keys` mirror's key formula (both previously
    `SUBSTITUTE(RR," ","")`).
  - Two spots that compared RR text with only trim+lowercase were
    brought onto the same key: the immediate-feedback history-max
    check and the duplicate-entry check in `computeWarnings_` —
    previously an RR stored/s typed with punctuation could silently
    miss its own history or duplicate.
  - `refreshCheckFormulas` now also rewrites the `_Keys` mirror
    formula (calls `refreshKeys_`), so existing workbooks upgrading
    get matching key generations on both sides of every lookup;
    without it, old `_Keys` keys would mismatch the new month-tab
    keys and every VLOOKUP would fail. `buildMonthSheet_` calls
    `refreshKeys_` too, so the mirror self-heals even if nobody runs
    the menu (new month tab → both sides rewritten to the current
    generation); `refreshKeys_` no longer stacks duplicate sheet
    protections on re-runs (guarded like `refreshConsolidated_`).
  - Version bumped to v1.8.0. Spec: §6 rule 1 + enforcement note
    updated, decision D25 added; deployment guide: upgrade note and
    a troubleshooting row (stale keys after upgrade); README
    validation section updated.
  - **Upgrade:** paste both files, run `setupWorkbook` once, then
    menu *Meter Register > Refresh check formulas (all months)*
    (this now also refreshes `_Keys`), then deploy a new version.

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
