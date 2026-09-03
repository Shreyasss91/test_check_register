# Requirements — Digital Meter Inspection Register

Status: **v2.0 — approved for build** · 2026-08-25

## 1. Problem

A 20-member team inspects distribution utility meters at spots. Today each
person records findings in a paper register; at month-end all registers are
physically collected and manually consolidated. Goal: digitize entry and make
consolidation automatic/live. Analytics on the collected data come later.

## 2. Platform

One single Google Sheets file as the data store + one **Apps Script Web App**
(mobile-friendly form) as the only entry point for inspectors. No custom
backend/hosting, no photos, text-only entry. Inspectors never open the Sheet;
the consolidator lives in it.

## 3. Roles & access

| Role | Count | Can do |
|---|---|---|
| Inspector | ~20 | Open the **web app** with their Google login, submit inspection forms (incl. while offline — queued) |
| Consolidator | 1 | Owns Sheet & script deployment; maintains Master/Team; creates/closes months; corrects any row; exports; manages sharing |

Inspectors have **no edit access to the Sheet** (viewer at most). The web app
executes as the consolidator and writes on their behalf. All access via
personal Gmail addresses (no Workspace domain). Sheets version history is the
audit trail. Auto-formula columns and Master are protected; past-month tabs
are locked read-only after close.

### 3.1 File governance — single source of truth

Rules that guarantee all ~20 members operate on the same system:

1. Only the consolidator creates the workbook and deploys the web app.
   Inspectors use only the **web app URL** (pinned in team chat); they have
   no reason to ever touch Drive/Sheets — which makes stray copies
   practically impossible.
2. Sharing settings: the Sheet is not shared for editing with inspectors;
   "Editors can change permissions and share" stays OFF.
3. One canonical web-app URL, pinned in the team chat; everyone bookmarks it
   or adds it to their phone home screen (*Add to Home screen*).
4. Monthly check (consolidator): Drive search for the filename returns
   exactly one result; no editor other than the consolidator in the Share
   dialog.
5. Onboarding per member: add their Email to the `Team` tab → they open the
   pinned URL → log in with that Gmail → form works. Nothing else.

## 4. Workbook structure

Single spreadsheet containing:

| Tab | Purpose |
|---|---|
| `Master` | One row per meter: RR No, Account ID, MRID, MD DAY, SF, Name, Meter Constant, Make, Serial No, Phases, DTC, Feeder, Location |
| `Team` | Inspectors: Email + Name (login email drives "Entered By") |
| `<Month>` e.g. `2026-08` | One tab per month — all submitted entries land here |
| `Consolidated` | Live stack of all month tabs (all history, newest first) |

Month tab lifecycle: created at month start via the menu button ("New month
sheet") **or automatically** by the first submission of that month (same
template either way, so formulas never drift). At month end "Close month"
locks the tab read-only and the consolidator downloads an XLSX backup as
archive (an unlock option exists for corrections). Each month tab ships with
1,000 pre-filled formula rows (expected volume < 1,000 entries/month).
No per-person tabs anymore.

## 5. Data captured per inspection (one row)

| Field | Source | Notes |
|---|---|---|
| Date | pre-filled | device date, editable; dd-mm-yyyy |
| Time | pre-filled | device time at spot, editable; 12-h `hh:mm am/pm` |
| Entered By | **auto** | resolved from Google login email via `Team` tab |
| RR Number / Account ID | dropdown | enter either one; fed by `Master`; resolved meter may be recorded by multiple people |
| Reading (CKWh) | manual | main cumulative kWh |
| B1–B6 kWh | optional | per-block readings where applicable |
| Reading (Pr kW) | manual | present demand |
| B1–B6 kW | optional | per-block demand |
| PF | manual | |
| Meter Status | dropdown | OK / Defective / Seal broken / Meter stopped / Burnt / Not accessible; defaults to OK |
| Remarks | optional | |
| Meter Constant / Make / Serial No / Phases | **auto** | looked up from Master via RR Number (shown live in the form) |
| Spot meter details (optional) | collapsible form section | Constant/Make/Serial/Phases/DTC/Feeder/Location pre-filled from Master, editable at the spot; written to separate Spot-* columns — only fields the inspector actually entered/kept are stored |
| Month | **auto** | derived from Date |
| ⚠ Checks | **auto** | inline validation flags (see §6) |

Display conventions: readings 2 decimals (`#,##0.00`), PF 2 decimals.

Out of scope: photos, GPS, signatures, billing calculations.

## 6. Validation rules

Hard-blocked (input rejected):

1. RR Number **or** Account ID must be entered (either one suffices); the
   entered value(s) must resolve to a meter in `Master`. Matching is
   case-insensitive and ignores spaces (leading, trailing and middle).
   If both are entered they must belong to the same meter. An Account
   ID matching multiple meters is rejected as ambiguous. The resolved
   Master RR Number is what gets stored in the row.
2. PF must be between 0 and 1.

Flagged inline (⚠ column, entry still accepted):

3. CKWh below the highest previously recorded CKWh for the same RR Number,
   checked across **all months' history** (cumulative meters never run backwards).
4. Σ(B1…B6 kWh) deviates from the total CKWh by more than ±1 kWh.
5. Date's month does not match the month tab it was entered in.
6. Same RR Number + same Date + same Entered By already exists
   (same RR + same Date with a *different* Entered By is a legitimate
   cross-check visit — not flagged).
7. PF left blank while an RR Number is present.

Enforcement: hard-blocks run **server-side in the web app** on Submit
(rejected with a message); flag-rules are written into the row's ⚠ column
by the sheet formulas as before. Both layers compare RR Numbers
**normalized** (case-insensitive, all spaces removed) — the sheet side
does this through a hidden auto-generated `_Keys` tab plus a hidden key
column (AA) in each month tab, so hand-edited or legacy rows with variant
casing/spacing are checked identically to the server.

## 7. Entry web app (Apps Script)

- `doGet()` serves a single mobile-first page (HTML/CSS/JS served by the
  bound script — no external hosting).
- On load: script verifies the visitor's email exists in `Team` (else shows
  "not authorized"), then returns team/meter reference data for dropdowns.
- Form behavior: Date/Time pre-filled with device now (editable); picking an
  RR Number instantly shows Make/Serial/Constant/Phases; Submit calls
  server → hard-block validation → append to the month tab of the entry's
  Date (creating that month tab if absent).
- Offline at spot: submissions are stored in the browser (localStorage
  queue) and retried automatically when connectivity returns; queued count
  shown in the UI. Entries keep their spot-time Date/Time.
- Deployment: *Deploy > New deployment > Web app*, execute as **me**
  (consolidator), access: **any user with a Google account** (authorization
  still enforced per-Email via Team list). Every change = new version.

## 8. Corrections policy

Old rows are corrected only by the consolidator directly in the Sheet;
inspectors report mistakes to the consolidator (chat). Version history
records who changed what.

## 9. History (decided)

Start fresh from go-live. No back-entry of paper registers.

## 10. Non-goals

Photos, GPS, signatures, native mobile app, external hosting/backend,
billing analytics, paper-register migration. Analytics deferred but the
flat row format keeps later pivots easy (Entered By, RR Number, month).

## 11. Decision log

| # | Decision | Rationale |
|---|---|---|
| D1 | Google Sheets, single file | zero infra, phone-friendly, free |
| D2 | One tab per month, shared by all inspectors | matches "collect registers monthly"; simple mental model |
| D3 | "Entered By" typed/dropdown per row | replaces personal register identity; enables later analytics |
| D4 | Multiple inspectors may record the same RR Number | cross-checking visits is desirable |
| D5 | Edits to old rows allowed | simplest correction flow; audit via version history |
| D6 | Personal Gmail accounts | no Workspace available |
| D7 | Start fresh, no migration | avoids back-entry effort |
| D8 | Volume < 1,000 entries/month → 1,000 pre-filled rows per month tab | performance headroom |
| D9 | Month tabs named `YYYY-MM` (e.g. `2026-08`) | sorts chronologically |
| D10 | Block-sum vs total tolerance = ±1 kWh, flag only | agreed domain tolerance |
| D11 | New month tab via Apps Script menu button | identical formulas every month, no drift |
| D12 | Fold-ins F1–F5 approved: all-history monotonic check, wrong-tab guard, duplicate guard, blank-PF flag, month-end XLSX backup | cheap now, painful later |
| D13 | Time in 12-hour `hh:mm am/pm` | field staff preference |
| D14 | Readings 2 dp, PF 2 dp | agreed display convention |
| D15 | File-governance rules (§3.1): single owner-created file, locked sharing, canonical pinned URL, monthly stray-file check | guarantees everyone works on one file |
| D16 | Inspectors enter via **Apps Script Web App** form; Sheet is consolidator-only | prevents direct-sheet mistakes & stray copies; zero infra kept |
| D17 | "Entered By" resolved from Google login email via Team tab | no impersonation, no typing names |
| D18 | Inspectors get no edit access to the Sheet; corrections via consolidator | single controlled write path (the web app) |
| D19 | Offline submissions queued in browser storage, auto-retried on reconnect | spots occasionally lack network |
| D20 | Month tab auto-created by first submission of the month (same template as menu button) | nobody blocked if consolidator forgot |

## 12. Open questions

None — spec complete.
