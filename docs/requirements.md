# Requirements — Digital Meter Inspection Register

Status: **v1.2 — approved for build** · 2026-08-25

## 1. Problem

A 20-member team inspects distribution utility meters at spots. Today each
person records findings in a paper register; at month-end all registers are
physically collected and manually consolidated. Goal: digitize entry and make
consolidation automatic/live. Analytics on the collected data come later.

## 2. Platform

One single Google Sheets file. No custom backend, no photos, text-only entry.

## 3. Roles & access

| Role | Count | Can do |
|---|---|---|
| Inspector | ~20 | Append/edit data rows in month tabs; pick RR Number, fill readings |
| Consolidator | 1 | Full control: maintain Master & Team lists, create/close month tabs, correct anything, export, manage sharing |

All access via personal Gmail addresses (no Workspace domain). Sheets version
history is the audit trail. Auto-formula columns and Master are protected;
past-month tabs are locked read-only after close (except consolidator).

### 3.1 File governance — single source of truth

Rules that guarantee all ~20 members operate on the same file:

1. Only the consolidator creates the workbook. Inspectors open it via the
   shared link or *Shared with me* — never via "Make a copy" and never by
   re-uploading a downloaded XLSX/CSV.
2. Sharing settings: "Editors can change permissions and share" is OFF, so
   membership is controlled by the consolidator alone.
3. One canonical URL, pinned in the team chat; everyone bookmarks it.
   If the link works, nobody searches Drive for the file.
4. Monthly check: Drive search for the filename must return exactly one
   result. A stray copy → merge its new rows into the real month tab,
   delete the copy, remind its author.
5. Authenticity test for any user: the bound *Meter Register* menu exists
   only in the genuine file ("no menu" ⇒ you are in a copy).
6. Offline field capture uses the mobile app's offline mode on the shared
   file itself — it syncs to the same file, so there is no reason to keep
   local copies.

Onboarding (one time per member):

- Consolidator shares once via *Share* → member's Gmail address → Editor;
  the invite email carries the link.
- After the first open, the file permanently appears in the member's
  Google Sheets / Drive app under *Shared* — one tap opens it from then
  on; nobody types URLs repeatedly.
- Recommended: member stars the file (⭐) for top-of-list access; optional:
  open in phone browser → *Add to Home screen* for an app-like icon.

## 4. Workbook structure

Single spreadsheet containing:

| Tab | Purpose |
|---|---|
| `Master` | One row per meter: RR No, Meter Constant, Make, Serial No, Phases, Spot/Feeder |
| `Team` | List of inspector names (drives the "Entered By" dropdown) |
| `<Month>` e.g. `2026-08` | One tab per month — **all** inspectors append rows here during that month |
| `Consolidated` | Live stack of all month tabs (all history, newest first) |

Month tab lifecycle: consolidator creates the new month's tab via an
Apps Script menu button ("New month sheet") at month start — guarantees every
month tab has identical formulas (no drift); at month end "Close month" locks
the tab read-only, and the consolidator downloads an XLSX backup as archive
(an unlock option exists for corrections). Each month tab ships with 1,000
pre-filled formula rows (expected volume < 1,000 entries/month).
No per-person tabs anymore.

## 5. Data captured per inspection (one row)

| Field | Source | Notes |
|---|---|---|
| Date | manual | `Ctrl+;`, dd-mm-yyyy |
| Time | manual | `Ctrl+Shift+;`, 12-h `hh:mm am/pm` |
| Entered By | dropdown | from `Team` tab |
| RR Number | dropdown | fed by `Master`; same meter may be recorded by multiple people |
| Reading (CKWh) | manual | main cumulative kWh |
| B1–B6 kWh | optional | per-block readings where applicable |
| Reading (Pr kW) | manual | present demand |
| B1–B6 kW | optional | per-block demand |
| PF | manual | |
| Remarks | optional | |
| Meter Constant / Make / Serial No / Phases | **auto** | looked up from Master via RR Number |
| Month | **auto** | derived from Date |
| ⚠ Checks | **auto** | inline validation flags (see §6) |

Display conventions: readings 2 decimals (`#,##0.00`), PF 2 decimals.

Out of scope: photos, GPS, signatures, billing calculations.

## 6. Validation rules

Hard-blocked (input rejected):

1. RR Number must exist in `Master`.
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

## 7. Corrections policy (decided)

Old rows may be edited directly by anyone with editor access; the version
history records who changed what. No append-only correction protocol.

## 8. History (decided)

Start fresh from go-live. No back-entry of paper registers.

## 9. Non-goals (v1)

Photos, native app, custom backend/auth, consumption/billing analytics,
paper-register migration. Analytics explicitly deferred but the flat,
consistent row format above is designed to make later analysis easy
(e.g., pivot by Entered By, RR Number, month).

## 10. Decision log

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

## 11. Open questions

None — spec complete.
