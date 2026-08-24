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
| `Master` | Meter list: RR No, constant, make, serial, phases, spot/feeder |
| `Team` | Inspectors: Email + Name (login → identity) |
| `YYYY-MM` | One per month; 1 000 rows ready; ⚠ Checks column flags issues |
| `Consolidated` | All months stacked live, newest first |

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

## Monthly routine (consolidator)

- **Month start:** nothing required — the month tab is auto-created by the
  first submission (or menu *Meter Register > New month sheet…*).
- **Month end:** *Close month (lock)…* → download XLSX archive backup.
  (*Unlock month* exists for corrections.)

## Validation

Hard-blocked at Submit: unknown RR Number · PF outside 0–1.
Flagged in the ⚠ Checks column: CKWh below all-history max · block-sum off
by > ±1 kWh · wrong-month date · duplicates · missing PF.

## Field tips (inspectors)

- Open the pinned form URL once → browser menu → *Add to Home screen*.
- Date/Time are pre-filled at the spot and stay editable.
- No network? Submit anyway — it saves on the phone and sends itself later;
  the yellow bar shows how many entries are waiting.
- "Not authorized"? Your Gmail isn't in the Team tab yet — contact the
  consolidator.
