# Meter Inspection Register

Digitizes the monthly meter-inspection workflow for a ~20-member team.
Inspectors submit readings through a **mobile web form** (Apps Script Web
App); the form writes rows into a single consolidator-owned **Google Sheet**
— one tab per month, with a live **Consolidated** view. Spec:
[`docs/requirements.md`](docs/requirements.md) (v2.0).

## How it fits together

```
Inspector's phone ──(web form URL)──▶ Apps Script Web App ──▶ Month tab in Sheet
     Google login = identity              validates + writes      ▲
                                                                  └── Consolidated (live)
Consolidator ──(Sheet directly)──▶ Master · Team · close months · exports
```

- Inspectors **never touch the Sheet** — only the form. Their login email
  must be listed in the `Team` tab; "Entered By" comes from that mapping.
- Works offline at spots: submissions queue on the phone and send
  automatically when back online.

## Tabs

| Tab | Purpose |
|---|---|
| `Master` | Meter list: RR No, account ID, MRID, MD DAY, SF, name, constant, make, serial, phases, DTC, feeder, location |
| `Team` | Inspectors: Email + Name (login → identity) |
| `Configuration` | All dropdown lists — one **column** per list (header = name, values below). `Meter Status` (col A) drives the status dropdown; every other column auto-becomes an extra dropdown in the form + a dynamic month-tab column |
| `YYYY-MM` | One per month; 1 000 rows ready; ⚠ Checks column flags issues |
| `Consolidated` | All months stacked live, newest first |
| `Analytics` | Live pivots: entries per inspector/month/status, non-OK meters, feeder/DTC coverage + one pivot per Configuration list |
| `_Keys` | Hidden auto-generated helper: normalized RR keys for case/space-insensitive checks — do not edit |

## Editing dropdown lists (no code needed)

- **Meter status:** edit the values in `Configuration` column A — add
  "Replaced" between existing ones, fix a typo, reorder (the **first
  value is the form's default**). The web form and every month tab's
  dropdown pick it up live; nothing to re-run or redeploy.
- **A brand-new dropdown** (e.g. Seal Type): add a *new column* in
  `Configuration` with a header and its values. The form shows it as an
  extra dropdown immediately; submitted values land in a new dynamic
  column (AJ..) on every month tab — created on the first submit, or
  right away via menu *Meter Register > Apply configuration changes
  (all months)*. Consolidated and Analytics pick the column up too.
- Append-only: removing a list never deletes its stored data column.

## Setup (one time, consolidator)

1. Create a new [Google Sheet](https://sheets.new) → `Extensions > Apps Script`.
2. Paste [`apps-script/Code.gs`](apps-script/Code.gs) into `Code.gs`.
3. `File > New > HTML file`, name it exactly **Index**, paste
   [`apps-script/Index.html`](apps-script/Index.html). Save.
4. Run `setupWorkbook()` once, approve permissions.
5. Fill `Team` (each inspector's Gmail + name) and `Master` (meters).
   The RR-SAMPLE rows can be deleted once real meters exist.
6. **Deploy** → *New deployment* → type **Web app**
   - *Execute as*: **Me**
   - *Who has access*: **Anyone with a Google account**
   Copy the Web App URL → pin it in the team chat.
7. Do **not** share the Sheet itself with inspectors.

After any code change: *Deploy → Manage deployments → ✏ → New version*.

**Upgrading an existing workbook:** after pasting the new code, run
`setupWorkbook` once (creates the `Configuration` tab), then menu
*Meter Register > Refresh check formulas (all months)* — existing month
tabs get the normalized ⚠ formulas, the Spot-* detail columns and the
live status dropdown wired to `Configuration`; `Consolidated` is
refreshed automatically.

## Monthly routine (consolidator)

- **Month start:** nothing required — the month tab is auto-created by the
  first submission (or menu *Meter Register > New month sheet…*).
- **Month end:** *Close month (lock)…* → download XLSX archive backup
  (or *Export month to XLSX (Drive)…* — saves the month tab straight
  into a "Meter Register Exports" Drive folder).
  (*Unlock month* exists for corrections.)
- **Anytime:** *Master health check…* audits Master for duplicate RR
  Numbers, duplicate Account IDs, blank compulsory fields and leftover
  RR-SAMPLE rows.
- **After editing `Configuration`:** nothing needed for value edits. After
  adding a new list column: *Meter Register > Apply configuration changes
  (all months)* adds the new column to every month tab immediately and
  rebuilds Consolidated/Analytics (they also self-heal on the next
  submit).
- **Weekly digest (optional):** *Install weekly digest trigger (Mon
  8am)* emails you a summary every Monday — entries in the last 7 days
  (per inspector), flagged ⚠ rows, and month-tab capacity. *Send weekly
  digest now (test)* previews it.

## Validation

Hard-blocked at Submit: unknown RR Number/Account ID · PF outside 0–1.
Enter RR Number or Account ID (either one; matching ignores case and
spaces; both entered must agree).
Flagged in the ⚠ Checks column: CKWh below all-history max · block-sum off
by > ±1 kWh · wrong-month date · duplicates · missing PF. All RR matching
(server **and** sheet formulas) ignores case and spaces.

## Field tips (inspectors)

- Open the pinned form URL once → browser menu → *Add to Home screen*.
- Date/Time are pre-filled at the spot and stay editable.
- **Meter details (optional)** under the RR field opens Constant/Make/
  Serial/Phases/DTC/Feeder/Location — pre-filled from Master; correct
  them at the spot if the meter differs.
- No network? Submit anyway — it saves on the phone and sends itself later;
  the yellow bar shows how many entries are waiting.
- "E-mail not in Team list"? Your Gmail isn't in the Team tab yet — ask
  the admin to add it, or log in with an approved e-mail.
