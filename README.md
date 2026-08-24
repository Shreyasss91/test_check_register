# Meter Inspection Register (Google Sheets)

Digitizes the monthly meter-inspection workflow for a ~20-member team:
everyone logs readings in a shared **month tab** (`2026-08`, `2026-09`, …),
and the **Consolidated** tab merges all history live — no more collecting
paper registers at month-end. Spec: [`docs/requirements.md`](docs/requirements.md).

## Fields captured

Date · Time (12-h) · Entered By · RR Number · Reading (CKWh) + optional
B1–B6 kWh · Reading (Pr kW) + optional B1–B6 kW · PF · Remarks.
Meter Constant / Make / Serial No / Phases / Month auto-fill from the RR Number.

Validations: unknown RR and out-of-range PF are rejected; backwards CKWh,
block-sum mismatch (±1 kWh), wrong-month date, duplicates and missing PF
are flagged in the ⚠ Checks column.

## Tabs

| Tab | Purpose |
|---|---|
| `Master` | Meter list: RR No, constant, make, serial, phases, spot/feeder |
| `Team` | Inspector names (feeds "Entered By" dropdown) |
| `YYYY-MM` | One per month, shared by all inspectors, 1 000 rows ready |
| `Consolidated` | All months stacked live, newest first, with Source Tab |

## Setup (one time, consolidator)

1. Create a new [Google Sheet](https://sheets.new).
2. `Extensions > Apps Script` → paste all of
   [`apps-script/Code.gs`](apps-script/Code.gs) → save.
3. Run `setupWorkbook()` once, approve permissions.
4. Fill `Team` (names) and `Master` (meters). The two RR-SAMPLE rows can be
   deleted once real meters are entered.
5. Share the file as **Editor** with all inspectors.

## Monthly routine (consolidator)

- **Start of month:** menu *Meter Register > New month sheet…* → `2026-09`.
- **During month:** inspectors append rows; ⚠ Checks column flags issues.
- **End of month:** *Meter Register > Close month (lock)…*, then
  `File > Download > Microsoft Excel (.xlsx)` as archive backup.
  (*Unlock month* exists for corrections.)

## Field tips

- Date shortcut `Ctrl+;` · time shortcut `Ctrl+Shift+;`.
- No network at a spot? Google Sheets mobile app works offline for this
  file; entries sync when you're back online.
