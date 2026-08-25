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

## C. Initialize the structure

9. In the toolbar function dropdown select **setupWorkbook** → **Run**.
10. Approve permissions: *Review permissions* → account →
    *Advanced* → *Go to … (unsafe)* → **Allow**
    (expected warning: you authored the script yourself).
11. The Sheet now has tabs `Master`, `Team`, current month, `Consolidated`.

## D. Fill reference data

12. `Team` — one row per inspector:
    column A = their **Gmail address**, column B = their **name**
    (this exact name is written as "Entered By").
13. `Master` — one row per meter: RR Number, Meter Constant, Make,
    Serial No, Phases, Spot/Feeder. RR Numbers must be unique.
    Delete the two `RR-SAMPLE` rows once real meters are entered.

## E. Deploy the web app

14. Editor → top-right **Deploy** → **New deployment**.
15. ⚙ gear next to "Select type" → **Web app**.
16. Configure:

    | Setting | Value |
    |---|---|
    | Description | `v1` |
    | Execute as | **Me** (the consolidator — script writes on behalf of inspectors) |
    | Who has access | **Anyone with a Google account** |

17. **Deploy** → copy the Web App URL
    (`https://script.google.com/macros/s/…/exec`).
18. Pin that URL in the team chat. Do **not** share the Sheet itself
    with inspectors — they only ever need this URL.

## F. Verify before announcing

19. Open the URL on a phone logged into a Gmail that is in `Team`
    → form shows that person's name top-right.
20. Submit one test entry against an RR-SAMPLE meter → row appears in the
    month tab and in `Consolidated`; "Entered By" is correct.
21. Open the URL from a Gmail **not** in `Team`
    → must show *"Not authorized"*.
22. Airplane-mode test: submit while offline → yellow queue bar appears;
    reconnect → entry auto-sends within ~30 s.

## G. Future updates

23. Edit files here → paste updated contents into the Apps Script editor → save.
24. **Deploy → Manage deployments → ✏ → Version: New version → Deploy.**

    Keeping the same deployment means the same URL — inspectors' bookmarks
    never break.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Not authorized" for a real inspector | Their Gmail missing/mistyped in `Team` tab column A (check case/spaces) |
| Form stuck on "Loading…" | Deployment access not set to *Anyone with a Google account*, or user not logged into any Google account |
| Changes don't appear | Forgot step 24 — old version still deployed |
| Script file renamed / Index missing | HTML file must be named exactly `Index` |
| Inspector submits but no row | Check the month tab isn't locked (closed); check hard-block message shown by the form (unknown RR / PF range) |
