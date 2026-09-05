# Deployment Guide — Meter Inspection Register

Applies to spec v2.0 (`requirements.md`). One-time setup by the
**consolidator**, plus the routine for future updates.

## A. Create the workbook

1. Go to [sheets.new](https://sheets.new), logged in as the consolidator Gmail.
2. Name the file, e.g. `Meter Inspection Register`.
3. `Extensions` → `Apps Script` — the bound script editor opens.
4. Delete the default `function myFunction() {}` stub in `Code.gs`.

## B. Paste the two source files

5. Copy all of [`apps-script/Code.gs`](../apps-script/Code.gs) → paste into
   the editor's `Code.gs` tab.
6. Click `+` next to **Files** → **HTML** → name it exactly `Index`
   (no extension — the server loads it by this name).
7. Delete its default content → paste all of
   [`apps-script/Index.html`](../apps-script/Index.html).
8. Save (`Ctrl+S`).
   > **If the function dropdown (right of *Debug*) doesn't list
   > `setupWorkbook`:** close the Apps Script browser tab entirely and
   > reopen `Extensions → Apps Script` — the dropdown often needs a refresh
   > after a big paste. Also make sure the `Code.gs` tab is the active one.

## C. Initialize the structure

9. In the toolbar function dropdown select **setupWorkbook** → **Run**.
10. Approve permissions: *Review permissions* → account →
    *Advanced* → *Go to … (unsafe)* → **Allow**
    (expected warning: you authored the script yourself).
11. The Sheet now has tabs `Master`, `Team`, `Configuration`, `Guests`,
     `_Keys` (hidden — leave it alone), current month, `Consolidated`,
     `Analytics`.
12. **Existing workbooks upgrading to this version:** run
     `setupWorkbook` once. A populated `Master` is **migrated in place**
     (v1.9.0): existing columns are re-mapped to the new order — RR
     Number, Account ID, Tariff, NAME, SANC_KW, SANC_HP, CONT_DEM, DOS,
     STATUS, MR ID, MR DAY, SF, METER CONSTANT, METER_SERIAL_NO, Meter
     Make, Phases, DTC, Feeder, Location, Notes — with every stored value
     kept; the six new utility fields start blank for the consolidator to
     fill; `Configuration` and `Guests` tabs are created as before. Then
     menu *Meter Register > Refresh check formulas (all months)* to
     rewrite the ⚠-check formulas and the hidden RR-key columns on
     existing month tabs with the
     special-character-aware normalized versions and add the Spot-*
     detail columns. Month tabs
     created after the upgrade get them automatically. Existing
     meter-status dropdowns are re-pointed at `Configuration` column A
     (live from then on); stored status values are untouched. The
     previous "not authorized" hard block for unknown logins is replaced
     by the guest flow (v1.7.0) — the web app starts accepting them as
     `Name{email}` with a `Guests` log as soon as this version is
     deployed.
     - **v1.10.0 — Master scales to ~30,000 meters and the form never
       downloads it.** Meter resolution becomes a per-keystroke
       `lookupMeter` RPC (debounced 300 ms, memoized per session)
       against a 128-shard `METER_INDEX` cache. The index rebuilds
       automatically when Master's row count changes; in-place RR swaps
       (same row count) need the *Refresh check formulas (all months)*
       menu, which also invalidates the index. Every read (health check,
       `_Keys` mirror, validation) now covers all rows — no more
       silent 1,000-row cap.

## D. Fill reference data

13. `Team` — one row per inspector:
    column A = their **Gmail address**, column B = their **name**
    (this exact name is written as "Entered By").
14. `Master` — one row per meter, in this column order: RR Number,
     Account ID, Tariff, NAME, SANC_KW, SANC_HP, CONT_DEM, DOS, STATUS,
     MR ID, MR DAY, SF, METER CONSTANT, METER_SERIAL_NO, Meter Make,
     Phases, DTC, Feeder, Location, Notes.
     RR Numbers must be unique; Account IDs must not repeat across meters
     (inspectors may enter either field — a repeated Account ID is rejected
     as ambiguous). Delete the two `RR-SAMPLE` rows once real meters are
     entered.
15. `Configuration` — every dropdown list: one column per list, header =
    the list's name, values below (first value = the form's default).
    Column A is `Meter Status` (seeded with OK / Defective / Seal broken /
    Meter stopped / Burnt / Not accessible). To add a status, just add a
    value in the column — the form and month-tab dropdowns update live.
    To add a whole new dropdown (e.g. Seal Type), add a new column; the
    form picks it up on the next load. The tab is protected — edit as the
    consolidator (temporary protection warning to others is expected).

## E. Deploy the web app

15. Editor → top-right **Deploy** → **New deployment**.
16. ⚙ gear next to "Select type" → **Web app**.
17. Configure:

    | Setting | Value |
    |---|---|
    | Description | `v1` |
    | Execute as | **Me** (the consolidator — script writes on behalf of inspectors) |
    | Who has access | **Anyone with a Google account** |

18. **Deploy** → copy the Web App URL
    (`https://script.google.com/macros/s/…/exec`).
19. Pin that URL in the team chat. Do **not** share the Sheet itself
    with inspectors — they only ever need this URL.

## F. Verify before announcing

20. Open the URL on a phone logged into a Gmail that is in `Team`
     → form shows that person's name top-right.
21. Submit one test entry against an RR-SAMPLE meter → row appears in the
    month tab and in `Consolidated`; "Entered By" is correct.
22. Open the URL from a Gmail **not** in `Team`
      → must show the yellow **guest banner** (not a block): name field
      required, header chip shows "not in Team". Submitting records the
      row as `Name{email}` and adds a row to the `Guests` tab.
23. Airplane-mode test: submit while offline → yellow queue bar appears;
    reconnect → entry auto-sends within ~30 s.
24. **Lookup test (v1.10.0):** open the URL and start typing a real RR
    Number — the meter-info card should appear in ~300 ms (Tariff/SANC/
    DOS/STATUS/Make/Serial/Constant/Phases). If it never resolves, the
    `METER_INDEX` didn't populate: re-run `setupWorkbook` and check the
    execution log for cache errors.

## G. Future updates

24. Edit files here → paste updated contents into the Apps Script editor → save.
    Also bump `CONFIG.version` in `Code.gs` (shown in the form footer) so
    anyone can confirm which version is live.
25. **Deploy → Manage deployments → ✏ → Version: New version → Deploy.**

    Keeping the same deployment means the same URL — inspectors' bookmarks
    never break.

    *After any edit to Master in place* (RR value swapped, row reordered,
    data corrected without append/delete): run menu
    *Meter Register > Refresh check formulas (all months)* — it rewrites
    `_Keys` and invalidates the meter index, so lookups pick up the change
    on the next request.

## Troubleshooting

    | Symptom | Cause / fix |
    |---|---|
    | Weekly digest not arriving | Trigger not installed (menu *Meter Register > Install weekly digest trigger*), or it lands in Gmail spam — check that the Apps Script trigger exists under the clock icon in the editor |
    | `setupWorkbook` not in function dropdown | Stale editor after large paste — close the Apps Script tab and reopen `Extensions → Apps Script`; keep `Code.gs` as active tab |
| "Not authorized" for a real inspector | Their Gmail missing/mistyped in `Team` tab column A (check case/spaces) |
| Form stuck on "Loading…" | Deployment access not set to *Anyone with a Google account*, or user not logged into any Google account |
| Changes don't appear | Forgot step 25 — old version still deployed |
| Script file renamed / Index missing | HTML file must be named exactly `Index` |
| Inspector submits but no row | Check the month tab isn't locked (closed); check hard-block message shown by the form (unknown RR / PF range) |
| New Configuration list not in month tabs | Run menu *Meter Register > Apply configuration changes (all months)* — or just wait: the next submit auto-adds the column |
| "Unknown meter status" on submit | The submitted status isn't in `Configuration` column A (typo, or the form tab was open since before your edit — reload the form) |
| Guest rows still show `Name{email}` after adding to Team | Run menu *Meter Register > Sync guest names from Team* (also clears them from `Guests`) |
    | `Name{email}` entries flagged by the Entered-By dropdown | Expected: the dropdown warns for values outside Team but never blocks — guest entries are legitimate |
    | Meter still "Unknown RR" or history/duplicate flags look wrong after upgrading to v1.8.0 | Re-run menu *Meter Register > Refresh check formulas (all months)* — it now also rewrites the hidden `_Keys` mirror so both key generations match |
    | New/edited Master meter not resolving in the form right away | The lookup index rebuilds itself when Master's row count changes; after swapping RR values in place (same row count), run *Meter Register > Refresh check formulas (all months)* to force a rebuild |
