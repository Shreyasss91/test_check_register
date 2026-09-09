# Changelog

All notable changes to this project. One entry per commit, newest first
(generated from `git log`; oldest commit documented at the bottom).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Enter advances through the form** (`apps-script/Index.html`):
  pressing Enter (or the keyboard's Next/Go action) jumps to the next
  field in reading order — RR → Account ID → CKWh → Pr kW → B1 kW →
  PF → Meter status — so inspectors can walk the meter top-to-bottom
  without touching the screen. Enter on Meter status submits directly
  (client validation still runs; server re-checks). Modifier keys
  (Shift/Ctrl/Alt) keep default browser behavior, and the optional
  details/remarks sections stay off the main path. Version bumped to
  v1.13.7.

### Fixed

- **`DOS: ########` can no longer reach the form**
  (`apps-script/Code.gs`, `docs/deployment.md`): DOS is now guaranteed a
  readable date in the meter info card — a real Date cell always renders
  as `yyyy-MM-dd` regardless of what generic format sniffing sees, a
  date-range serial (1..60000) under a broken `#` display converts the
  same way, and a literal `########` text value (no recoverable date)
  is blanked so the card shows `—` and the health check reports the
  field as blank instead of echoing garbage. A wide non-date number
  under `#` shows as exact digits. Troubleshooting entry added covering
  both the stale-deployment case (check the footer version) and the
  literal-text case (replace with the real date). Version bumped to
  v1.13.6.

### Fixed

- **Display cleanup applied everywhere Master is read**
  (`apps-script/Code.gs`): the v1.13.4 exact-digits / readable-date fix now
  covers every consumer. Master's Account ID column is formatted as text
  and the DOS column widened (new `styleMaster_`, applied to fresh builds,
  in-place migrations, and existing current-layout Masters on the next
  `setupWorkbook`) so the sheet itself stops rendering 4.26E+09 and
  ########; the Master health check normalizes broken display strings
  before comparing (a numeric Account ID no longer reads as a duplicate of
  itself); the weekly digest rebuilds ######## date cells from the raw
  value so week-old rows aren't dropped; `meterDetailsByRow_` was factored
  into a shared `masterRowDisplay_` row reader; and the history-max
  warning strips thousands separators before parsing ("1,234.50" no
  longer reads as 1). `parseDMY_` also accepts the yyyy-MM-dd output of
  the cleanup. Version bumped to v1.13.5.

### Fixed

- **Meter info card: field order, account digits, DOS date**
  (`apps-script/Code.gs`, `apps-script/Index.html`): the card now presents
  one line per group — Name · Acct / Tariff · SANC · Cont.Demand / MR ID ·
  MR DAY · SF / Constant · Status · DOS · Make · Phases. Account IDs stored
  as numbers no longer display as scientific notation (4.26E+09 → exact
  digits) and DOS in a too-narrow column shows its date instead of
  ######## (rendered as yyyy-mm-dd) — both rebuilt from the cell's raw
  value + number format in `meterDetailsByRow_`, and the meter index now
  keys numeric Account IDs by their exact digits so typing the real
  account number resolves the meter. Form: Reading Pr kW and B1 kW demand
  sit side by side in one row, as do PF and Meter status. Version bumped
  to v1.13.4.

### Changed

- **Date/Time no longer shown in the form** (`apps-script/Index.html`,
  docs): the read-only Date/Time stamps added in v1.13.2 are removed from
  the form entirely — inspectors see no date or time UI at all. At Submit
  the current date and time are captured silently from the device clock
  and sent to the server; offline-queued entries keep the stamp captured
  at the spot as before. Docs synced (requirements §5 table + §7, README
  field tips); version bumped to v1.13.3.

- **Android APK now targets the deployed Web App directly** (`android/app/build.gradle`, `.github/workflows/build-android.yml`): configured the supplied Apps Script `/exec` deployment URL as the release `WEB_APP_URL` and simplified the manual GitHub Actions build so the workflow builds the configured APK without requiring the URL as an input.

### Added

- **Android APK wrapper** (`android/`): added a lightweight Android launcher for the deployed Meter Inspection Apps Script Web App. It uses Android Custom Tabs rather than an embedded WebView so the existing Google account authentication/session flow remains in the supported browser surface. Added a Gradle project, launcher icon, build documentation, and a manual GitHub Actions workflow that publishes the release APK as an artifact.

### Changed

- **Date/Time are now read-only, stamped at Submit** (`apps-script/Index.html`,
  docs): the editable Date and Time inputs are replaced with read-only
  stamps of the device clock (refreshed on load and after each Submit).
  Submitting stamps the date and time from the device clock at that moment
  and sends it to the server — inspectors can no longer edit either field.
  Offline-queued entries keep the stamp captured at the spot as before.
  Docs synced (README field tips, requirements §5 table + §7); version
  bumped to v1.13.2.

- **B1 kW demand input layout** (`apps-script/Index.html`): B1 kW input
  placed immediately below Reading Pr kW (separate required field);
  collapsible "Block demand – B2…B6 kW (optional)" follows. B1 remains
  compulsory (client `required` attribute + validation; server
  re-check). Version bumped to v1.13.1.

### Changed

- **B1 kW is now a required entry** (`apps-script/Code.gs`,
  `apps-script/Index.html`, docs): block demand B1 joins CKWh and
  Pr kW as a hard-required field — submit is rejected with "B1 kW
  (block demand) is required." when empty (client checks first, server
  re-checks; the offline queue parks the rejected entry instead of
  blocking the rest). B2–B6 kW stay optional, as do all six B kWh
  readings. Docs synced (requirements §6 field table splits B1 kW from
  B2–B6 kW); version bumped to v1.13.0.

### Changed

- **New default Meter Status list** (`apps-script/Code.gs`, docs):
  fresh workbooks seed `Configuration` column A — and the built-in
  fallback when the tab is missing — with **OK / MNR / Meter burnt /
  Link burnt / No display / Not accessible / Others** (was OK /
  Defective / Seal broken / Meter stopped / Burnt / Not accessible).
  First value = form default, so **OK** stays the default. Existing
  workbooks are deliberately NOT auto-migrated: `setupWorkbook` rebuilds
  the Configuration tab from scratch (custom lists in other columns would
  be lost), so the deployment guide says to edit column A directly
  instead. Old rows keep their stored status text — the month-tab status
  dropdown warns but never blocks, so legacy values stay visible.
  Version bumped to v1.12.0.

### Changed

- **No login e-mail no longer hard-blocks the form**
  (`apps-script/Code.gs`, `apps-script/Index.html`, docs): a browser
  session that is not signed into a Google account used to be refused
  outright (`getBootstrap` → `not_authorized`, submit rejected with
  "No login e-mail available") — inspectors in the field could not enter
  anything at all. Now the session opens as a **no-email guest**: the
  form asks for their name (same guest card as before) and the row is
  recorded with "Entered By" = `Name (no email)`. There is no e-mail to
  log in `Guests`, so these entries cannot be auto-merged by *Sync guest
  names from Team* — logging into Google before opening the form remains
  the recommended path (banner says so).
  - `currentUser_` returns `{ email:'', guest:true, noEmail:true }`
    instead of `null` for anonymous sessions; `null` now means only
    "Team lists this e-mail with an empty Name cell" (a consolidator
    data fix, with a clear message on boot and submit).
  - `getBootstrap` skips the Guests pre-fill lookup for no-email
    sessions; `lookupMeter` serves them normally.
  - The name `"no email"` (in any spelling/punctuation) is rejected at
    submit on both client and server so the label can't be forged into
    an ambiguous identity.
  - Docs synced: requirements §7 / Entered-By row / D23, README guests
    section, deployment upgrade note + troubleshooting rows ("stuck on
    Loading" is no longer caused by not being logged in; the Team
    empty-Name case is documented as the only remaining "not
    authorized" refusal).
  - Version bumped to v1.11.0.

### Added

- **`CLAUDE.md` entry-point for future Claude Code sessions** — points
  at the canonical `AGENTS.md` for the deep invariants and surfaces the
  highest-leverage ones inline (normalization-in-lockstep, Master column
  order, `METER_INDEX` stamp semantics, ES5-only, in-place Master
  migration), plus the `node --check` verify commands for both
  `Code.gs` and the inline `<script>` blocks of `Index.html`, and the
  deploy order / changelog discipline. Version unchanged.
