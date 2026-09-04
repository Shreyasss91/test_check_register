/**
 * DISTRIBUTION UTILITY METER INSPECTION REGISTER
 * Implements docs/requirements.md v2.0
 *
 * One spreadsheet (consolidator-owned) + one Apps Script Web App.
 * Inspectors use only the web form; the script writes rows on their behalf
 * and resolves "Entered By" from their Google login email via the Team tab.
 * Unknown logins are NOT blocked: they run as guests (name typed in the
 * form, recorded as "Name{email}", e-mail captured in the Guests tab) and
 * are renamed by "Sync guest names from Team" once added to Team.
 *
 * SETUP (one time, consolidator)
 *   1. Create a new Google Sheet. Extensions > Apps Script.
 *   2. Paste Code.gs. File > New > HTML file, name it exactly: Index,
 *      paste apps-script/Index.html into it. Save.
 *   3. Run setupWorkbook() once (permissions).
 *   4. Fill Team (Email + Name) and Master. Delete RR-SAMPLE rows later.
 *      The Configuration tab holds all dropdown lists (edit/add any time).
 *   5. Deploy > New deployment > Web app:
 *        Execute as: Me    Who has access: Anyone with a Google account
 *      Share that URL with inspectors. Re-deploy a NEW VERSION after edits.
 */

var CONFIG = {
  version: 'v1.8.0', // bump on every deploy; shown in the form footer
  prefillRows: 1000,
  maxMasterRows: 1000,
  maxTeamRows: 200,
  maxConfigValues: 100, // per Configuration column
  maxGuestRows: 500,

  // fixed month-tab layout: cols 1..35 (A..AI) - see the layout comment above
  // onOpen(). Dynamic config columns (from the Configuration tab) are appended
  // from col 36 (AJ) onwards, in lockstep on every month tab.
  configFirstCol: 36,

  meterStatusHeader: 'Meter Status', // the Configuration column backing col U
  defaultMeterStatuses: ['OK', 'Defective', 'Seal broken', 'Meter stopped', 'Burnt', 'Not accessible'],

  masterHeaders: [
    'RR Number', 'Account ID', 'MRID', 'MD DAY', 'SF', 'Name',
    'Meter Constant', 'Meter Make', 'Meter Serial No', 'Phases',
    'DTC', 'Feeder', 'Location', 'Notes'
  ],
  masterSampleRows: [
    ['RR-SAMPLE-01', 'ACC-001', 'MR-001', '15', '1', 'Consumer One',
      '11', 'L&T', 'LT12345', '3', 'DTC-01', 'Feeder A', 'Location X',
      'sample row - edit or delete'],
    ['RR-SAMPLE-02', 'ACC-002', 'MR-002', '10', '1', 'Consumer Two',
      '22', 'Secura', 'SE67890', '1', 'DTC-02', 'Feeder B', 'Location Y', '']
  ],

  teamHeaders: ['Email', 'Name'],
  teamSampleRows: [
    ['inspector1@gmail.com', 'Person One'],
    ['inspector2@gmail.com', 'Person Two']
  ],

  guestHeaders: ['Email', 'Name', 'First Seen', 'Last Seen', 'Submissions'],

  registerHeaders: [
    'Date', 'Time', 'Entered By', 'RR Number', 'Reading (CKWh)',
    'B1 kWh', 'B2 kWh', 'B3 kWh', 'B4 kWh', 'B5 kWh', 'B6 kWh',
    'Reading (Pr kW)', 'B1 kW', 'B2 kW', 'B3 kW', 'B4 kW', 'B5 kW', 'B6 kW',
    'PF', 'Meter Status', 'Remarks',
    'Meter Constant', 'Meter Make', 'Meter Serial No', 'Phases', 'Month'
  ],
  // spot-entered meter details (optional, from the form's collapsible section)
  spotHeaders: [
    'Spot Constant', 'Spot Make', 'Spot Serial No', 'Spot Phases',
    'Spot DTC', 'Spot Feeder', 'Spot Location'
  ]
};

var MONTH_RE = /^\d{4}-\d{2}$/;

/* Consolidated layout (QUERY output order): A..Z = 1..26 (Z=26 Meter
   Status), then month-tab AB..AI = 27..34 (27 RR Key, 28..30 Spot
   Const/Make/Serial, 31 Spot Phases, 32 Spot DTC, 33 Spot Feeder,
   34 Spot Location), 35 = Source Tab, 36+ = dynamic config columns
   (AJ.., one per extra Configuration-tab list). Analytics pivots query
   these. */

/* ================= configuration tab ================= */

/* The Configuration tab is the single edit point for every dropdown list:
   row 1 = header (the list's name, must be unique), each row below = one
   value. The first value is the form's default.
   - "Meter Status" backs month-tab column U (fixed layout).
   - Every OTHER column is appended to all month tabs as a dynamic column
     (from col 36 / AJ, in lockstep) and auto-rendered as an extra dropdown
     in the web form. Adding values or whole new columns needs NO code edit
     - just edit the sheet; the form picks them up on next load, and month
     tabs get the new column on the next submit or via the
     "Apply configuration changes" menu item.
   - Append-only: renaming/removing a Configuration column never deletes
     month-tab data (the orphan column is left as-is). */

// builds the Configuration tab with the current status list (setup only)
function buildConfiguration_(ss) {
  var sh = resetSheet_(ss, 'Configuration');
  applyConfigSheet_(ss, sh);
  return sh;
}

// shared body used by both buildConfiguration_ and ensureConfiguration_
function applyConfigSheet_(ss, sh) {
  sh.getRange('A1').setValue(CONFIG.meterStatusHeader);
  sh.getRange(2, 1, CONFIG.defaultMeterStatuses.length, 1).setValues(
    CONFIG.defaultMeterStatuses.map(function (s) { return [s]; }));
  styleHeader_(sh, 10); // style ahead so future column headers match
  sh.setFrozenRows(1);
  sh.getRange(1, 1, CONFIG.maxConfigValues, 26).setNumberFormat('@');
  sh.setColumnWidth(1, 140);
  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
    protectStrict_(sh.protect(), 'Configuration - consolidator only');
  }
}

// returns the existing Configuration tab, creating it (seeded) if missing -
// keeps old deployments working on first call
function ensureConfiguration_(ss) {
  var sh = ss.getSheetByName('Configuration');
  if (!sh) sh = buildConfiguration_(ss);
  return sh;
}

/* reads every populated column of the Configuration tab:
   { '<header>': ['v1', 'v2', ...], ... } - first value = form default.
   Column A is expected to be Meter Status; a missing/empty tab falls back
   to the built-in status list so the form never breaks. */
function readConfigLists_(ss) {
  var sh = ss.getSheetByName('Configuration');
  var lists = {};
  if (sh) {
    var lastCol = sh.getLastColumn();
    if (lastCol > 0) {
      var vals = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), lastCol).getDisplayValues();
      for (var c = 0; c < lastCol; c++) {
        var header = String(vals[0][c] || '').trim();
        if (!header) continue;
        var list = [];
        for (var r = 1; r < vals.length; r++) {
          var v = String(vals[r][c] || '').trim();
          if (!v) break; // stop at the first blank cell in the column
          if (list.indexOf(v) === -1) list.push(v);
        }
        if (list.length) lists[header] = list;
      }
    }
  }
  if (!lists[CONFIG.meterStatusHeader]) {
    lists[CONFIG.meterStatusHeader] = CONFIG.defaultMeterStatuses.slice();
  }
  return lists;
}

// dynamic (non-Meter-Status) config lists, header order preserved
function dynamicConfigLists_(lists) {
  var out = [];
  Object.keys(lists).forEach(function (h) {
    if (h !== CONFIG.meterStatusHeader) out.push({ header: h, values: lists[h] });
  });
  return out;
}

/* ================= guests tab ================= */

/* The Guests tab logs every login that was NOT in Team when they used the
   web form (no hard block): Email, the name they typed, First/Last Seen,
   and how many entries they submitted. Their rows go out as
   "Name{email}" in the Entered By column so the origin is always
   traceable. Once you add their e-mail to Team, run
   "Sync guest names from Team" - every "Name{email}" row becomes exactly
   the Team name, so their history merges with their future entries. */

// builds the Guests tab (setup only); consolidator-editable like Team
function buildGuests_(ss) {
  var sh = resetSheet_(ss, 'Guests');
  sh.getRange(1, 1, 1, CONFIG.guestHeaders.length).setValues([CONFIG.guestHeaders]);
  styleHeader_(sh, CONFIG.guestHeaders.length);
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('@');
  sh.setColumnWidth(1, 220);
  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
    protectStrict_(sh.protect(), 'Guests - consolidator only');
  }
  return sh;
}

// returns the existing Guests tab, creating it (empty) if missing
function ensureGuests_(ss) {
  var sh = ss.getSheetByName('Guests');
  if (!sh) sh = buildGuests_(ss);
  return sh;
}

/* Records (or refreshes) a guest: upserts Email / Name / First Seen /
   Last Seen / Submissions++ on the Guests tab. Called inside the submit
   lock, so counts cannot race. Returns the guest display name. */
function recordGuest_(ss, email, name) {
  var sh = ensureGuests_(ss);
  var vals = sh.getRange(2, 1, CONFIG.maxGuestRows, 5).getDisplayValues();
  var now = new Date();

  var existing = -1; // index in vals with this e-mail
  var empty = -1;    // index of first empty row
  for (var i = 0; i < vals.length; i++) {
    var em = String(vals[i][0] || '').trim().toLowerCase();
    if (em === email) { existing = i; break; }
    if (empty === -1 && !em) empty = i;
  }

  if (existing >= 0) {
    var seen = parseInt(vals[existing][4], 10) || 0;
    var firstSeen = vals[existing][2] || now;
    sh.getRange(existing + 2, 1, 1, 5)
      .setValues([[email, name, firstSeen, now, seen + 1]]);
  } else {
    var row = empty >= 0 ? empty + 2 : sh.getLastRow() + 1;
    if (row > CONFIG.maxGuestRows + 1) row = CONFIG.maxGuestRows + 1; // cap: overwrite last slot
    sh.getRange(row, 1, 1, 5).setValues([[email, name, now, now, 1]]);
  }
  return name + '{' + email + '}';
}

/* Menu: rewrites every guest row ("Name{email}") in all month tabs to the
   Team name for that e-mail (exactly what Team says - so guest history
   merges with the person's future Team entries). Rows whose e-mail is
   still not in Team are left untouched. Consolidated/Analytics are live
   views over the month tabs, so they update automatically. */
function syncGuestNames() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();

  var team = ss.getSheetByName('Team').getRange(2, 1, CONFIG.maxTeamRows, 2).getDisplayValues();
  var emailToName = {};
  team.forEach(function (r) {
    var em = String(r[0] || '').trim().toLowerCase();
    var nm = String(r[1] || '').trim();
    if (em && nm) emailToName[em] = nm;
  });

  var re = /^(.*)\{([^}]+)\}$/; // "Name{email}"
  var changed = 0, scanned = 0;
  monthSheets_(ss).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var last = Math.min(sh.getLastRow(), CONFIG.prefillRows + 1);
    if (last < 2) return;
    var range = sh.getRange(2, 3, last - 1, 1); // C: Entered By
    var vals = range.getDisplayValues();
    var dirty = false;
    for (var i = 0; i < vals.length; i++) {
      var v = String(vals[i][0] || '').trim();
      var m = re.exec(v);
      if (!m) continue;
      scanned++;
      var em = m[2].trim().toLowerCase();
      if (!emailToName[em]) continue; // not in Team yet - leave for next run
      var nn = emailToName[em];
      if (v !== nn) { vals[i][0] = nn; dirty = true; changed++; }
    }
    if (dirty) range.setValues(vals);
  });

  // drop the Guest rows that are now Team members (they are no longer pending)
  var dropped = 0;
  var gsh = ss.getSheetByName('Guests');
  if (gsh) {
    var gv = gsh.getRange(2, 1, CONFIG.maxGuestRows, 1).getDisplayValues();
    var kill = [];
    gv.forEach(function (r, i) {
      var em = String(r[0] || '').trim().toLowerCase();
      if (em && emailToName[em]) kill.push(i + 2);
    });
    kill.reverse().forEach(function (row) {
      gsh.getRange(row, 1, 1, 5).clearContent();
      dropped++;
    });
  }

  ui.alert(
    'Guest names synced from Team.',
    (changed
      ? changed + ' row(s) rewritten to the Team name.'
      : 'No guest rows needed a rename.') +
    '\nGuest-marked rows scanned: ' + scanned + '.' +
    (dropped ? '\nGuests promoted to Team (rows removed from Guests tab): ' + dropped + '.' : '') +
    '\n\nRows whose e-mail is not yet in Team stay as Name{email} - re-run this after adding them.',
    ui.ButtonSet.OK
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Meter Register')
    .addItem('New month sheet…', 'newMonthSheet')
    .addItem('Close month (lock)…', 'closeMonth')
    .addItem('Unlock month (corrections)…', 'unlockMonth')
    .addItem('Export month to XLSX (Drive)…', 'exportMonth')
    .addItem('Refresh Consolidated', 'refreshConsolidatedMenu')
    .addItem('Refresh check formulas (all months)', 'refreshCheckFormulas')
    .addItem('Apply configuration changes (all months)…', 'applyConfigChangesMenu')
    .addItem('Rebuild Analytics tab', 'rebuildAnalyticsMenu')
    .addSeparator()
    .addItem('Send weekly digest now (test)', 'sendWeeklyDigestMenu')
    .addItem('Install weekly digest trigger (Mon 8am)', 'installWeeklyDigest')
    .addSeparator()
    .addItem('Master health check…', 'masterHealthCheck')
    .addItem('Sync guest names from Team', 'syncGuestNames')
    .addSeparator()
    .addItem('Rebuild all sheets (erases data!)', 'rebuildWithConfirm')
    .addToUi();
}

/* ================= setup ================= */

function setupWorkbook() {
  var ss = SpreadsheetApp.getActive();
  buildMaster_(ss);
  buildTeam_(ss);
  buildConfiguration_(ss);
  buildGuests_(ss);
  refreshKeys_(ss);
  if (monthSheets_(ss).length === 0) {
    buildMonthSheet_(ss, Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM'));
  }
  syncConfigColumns_(ss);
  refreshConsolidated_(ss);
  refreshAnalytics_(ss);
}

function rebuildWithConfirm() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Rebuild sheets?',
    'Every tab (Master, Team, Configuration, Guests, Consolidated, months) is deleted and recreated. ALL data is lost.\n\n' +
      'A full XLSX backup is saved to Drive first. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  var ss = SpreadsheetApp.getActive();

  // safety net: full-workbook XLSX backup before erasing anything
  var backupName = null;
  try {
    var blob = exportAllBlob_(ss);
    var folder = getOrCreateFolder_();
    var file = DriveApp.createFile(blob);
    backupName = 'Meter Register FULL BACKUP (' +
      Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') + ').xlsx';
    file.setName(backupName);
  } catch (err) {
    var goOn = ui.alert(
      'Backup failed',
      'Could not save the backup: ' + (err && err.message || err) +
      '\n\nRebuild anyway WITHOUT a backup?',
      ui.ButtonSet.YES_NO
    );
    if (goOn !== ui.Button.YES) return;
  }

  var tmp = null;
  var known = function (n) { return MONTH_RE.test(n) || /^(Master|Team|Configuration|Guests|Consolidated|_Keys|Analytics)$/.test(n); };
  if (ss.getSheets().every(function (s) { return known(s.getName()); })) tmp = ss.insertSheet('temp-rebuild');
  ss.getSheets().forEach(function (s) {
    var n = s.getName();
    if (known(n)) ss.deleteSheet(s);
  });
  setupWorkbook();
  if (tmp) ss.deleteSheet(tmp);
  ui.alert('Done. Workbook rebuilt.' +
    (backupName ? '\n\nBackup saved to Drive folder "Meter Register Exports":\n' + backupName : ''));
}

// whole-workbook XLSX (all tabs)
function exportAllBlob_(ss) {
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?exportFormat=xlsx';
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Export endpoint returned HTTP ' + resp.getResponseCode() + '.');
  }
  return resp.getBlob();
}

/* ================= menu actions ================= */

// exports one month tab as XLSX into a "Meter Register Exports" Drive folder
function exportMonth() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  var name = pickMonth_(ss, 'Export which month?');
  if (!name) return;

  try {
    var blob = exportBlob_(ss, name);
    var folder = getOrCreateFolder_();
    var file = DriveApp.createFile(blob);
    file.setName('Meter Register ' + name + ' (' +
      Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') + ').xlsx');
    ui.alert('Exported "' + name + '"', 'Saved to Drive folder "Meter Register Exports":\n' +
      file.getName() + '\n\nOpen: ' + file.getUrl(), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Export failed: ' + (err && err.message || err));
  }
}

function exportBlob_(ss, name) {
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() +
    '/export?exportFormat=xlsx&gid=' + ss.getSheetByName(name).getSheetId();
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Export endpoint returned HTTP ' + resp.getResponseCode() + '.');
  }
  return resp.getBlob();
}

function getOrCreateFolder_() {
  var it = DriveApp.getFoldersByName('Meter Register Exports');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Meter Register Exports');
}

function newMonthSheet() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  var def = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM');
  var res = ui.prompt('New month sheet', 'Tab name (YYYY-MM):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var name = res.getResponseText().trim();
  if (!MONTH_RE.test(name)) { ui.alert('Name must be YYYY-MM.'); return; }
  if (ss.getSheetByName(name)) { ui.alert('"' + name + '" already exists.'); return; }
  buildMonthSheet_(ss, name);
  refreshConsolidated_(ss);
  ss.setActiveSheet(ss.getSheetByName(name));
}

function closeMonth() {
  var ss = SpreadsheetApp.getActive();
  var name = pickMonth_(ss, 'Close (lock) which month?');
  if (!name) return;
  var p = ss.getSheetByName(name).protect();
  p.setDescription('Closed month - locked by consolidator');
  p.getEditors().forEach(function (e) { p.removeEditor(e); });
  SpreadsheetApp.getUi().alert('Locked "' + name +
    '". Tip: File > Download > Microsoft Excel for the archive backup.');
}

function unlockMonth() {
  var ss = SpreadsheetApp.getActive();
  var name = pickMonth_(ss, 'Unlock which month for corrections?');
  if (!name) return;
  ss.getSheetByName(name).getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .forEach(function (p) { p.remove(); });
  SpreadsheetApp.getUi().alert('Unlocked "' + name + '".');
}

/* ================= weekly digest ================= */

function sendWeeklyDigestMenu() {
  var n = sendWeeklyDigest();
  SpreadsheetApp.getUi().alert('Weekly digest sent.' +
    (n ? ' (' + n + ' entries this week.)' : ' (No entries this week — still sent a short note.)'));
}

// creates a Monday 08:00 time-based trigger (idempotent - deletes old digests first)
function installWeeklyDigest() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendWeeklyDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendWeeklyDigest')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  SpreadsheetApp.getUi().alert('Weekly digest scheduled: every Monday 08:00.\n' +
    'Runs as the consolidator — sent to your Gmail. Use "Send weekly digest now" to preview.');
}

// returns the number of entries in the past 7 days (used by the menu for feedback)
function sendWeeklyDigest() {
  var ss = SpreadsheetApp.getActive();
  var tz = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  var months = monthSheets_(ss);
  var perInspector = {}, labels = {}, total = 0, flagged = [];
  var capacity = [];

  months.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var last = Math.min(sh.getLastRow(), CONFIG.prefillRows + 1);
    if (last < 2) return;
    var rows = sh.getRange(2, 1, last - 1, 27).getDisplayValues(); // A..AA
    var used = 0;
    for (var i = 0; i < rows.length; i++) {
      var d = parseDMY_(rows[i][0]);
      if (!d || d < weekAgo) {
        if (rows[i][3]) used++; // still count capacity for old rows
        continue;
      }
      if (!rows[i][3]) continue; // empty row
      total++;
      used++;
      // guests are counted per e-mail (Name{email} - the name part may
      // vary between visits; the e-mail is the stable identity)
      var who = rows[i][2] || '(unknown)';
      var gm = /^(.*)\{([^}]+)\}$/.exec(who);
      var key = gm ? gm[2].toLowerCase() : who;
      perInspector[key] = (perInspector[key] || 0) + 1;
      labels[key] = who;

      var flags = String(rows[i][26] || '').trim(); // AA = ⚠ Checks
      if (flags && flags !== '\u26A0 Checks') flagged.push(name + ' row ' + (i + 2) + ' (' + rows[i][3] + ', ' + who + '): ' + flags);
    }
    var capPct = Math.round(used * 100 / CONFIG.prefillRows);
    if (capPct >= 70) capacity.push('  • ' + name + ': ' + used + '/' + CONFIG.prefillRows + ' rows (' + capPct + '%)');
  });

  var lines = [];
  lines.push('WEEKLY DIGEST — Meter Inspection Register');
  lines.push(Utilities.formatDate(now, tz, 'EEEE, d MMMM yyyy'));
  lines.push('');
  lines.push('Entries in the last 7 days: ' + total);
  lines.push('');
  if (Object.keys(perInspector).length) {
    lines.push('Per inspector:');
    Object.keys(perInspector).sort(function (a, b) { return perInspector[b] - perInspector[a]; })
      .forEach(function (k) { lines.push('  • ' + labels[k] + ': ' + perInspector[k]); });
  } else {
    lines.push('Per inspector: no submissions this week.');
  }
  lines.push('');
  if (flagged.length) {
    lines.push('Flagged rows (⚠ Checks), ' + flagged.length + ':');
    flagged.slice(0, 30).forEach(function (f) { lines.push('  • ' + f); });
    if (flagged.length > 30) lines.push('  • … and ' + (flagged.length - 30) + ' more');
  } else {
    lines.push('Flagged rows: none. ✓');
  }
  lines.push('');
  if (capacity.length) {
    lines.push('Month-tab capacity:');
    capacity.forEach(function (c) { lines.push(c); });
  } else {
    lines.push('Month-tab capacity: all below 70%.');
  }
  lines.push('');
  lines.push('— Sent automatically by the Meter Register script.');

  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    'Meter Register weekly digest — ' + total + ' entries',
    lines.join('\n'));
  return total;
}

function refreshConsolidatedMenu() {
  refreshConsolidated_(SpreadsheetApp.getActive());
  SpreadsheetApp.getUi().alert('Consolidated refreshed.');
}

// rewrites normalized-check formulas + spot headers on every month tab (incl. old ones)
function refreshCheckFormulas() {
  var ss = SpreadsheetApp.getActive();
  ensureConfiguration_(ss);
  syncConfigColumns_(ss);
  refreshKeys_(ss); // re-point the hidden key mirror at the current normalization
  var months = monthSheets_(ss);
  months.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    sh.getRange(1, 27, 1, 2).setValues([['\u26A0 Checks', 'RR Key']]);
    sh.getRange(1, 29, 1, CONFIG.spotHeaders.length).setValues([CONFIG.spotHeaders]);
    sh.getRange(2, 22, CONFIG.prefillRows, 7).setFormulas(autoFormulas_(CONFIG.prefillRows, name));
  });
  refreshConsolidated_(ss);
  SpreadsheetApp.getUi().alert('Check formulas refreshed on ' + months.length + ' month tab(s).');
}

/* Applies Configuration-tab edits to every month tab + the views that
   depend on them: appends missing dynamic columns (header, live dropdown
   validation wired to the Configuration column, text format, protected
   header), then rebuilds Consolidated and Analytics. Editing values in a
   list needs neither this nor any code - month-tab dropdowns read the
   Configuration range live. Run this after ADDING a Configuration column. */
function applyConfigChangesMenu() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  ensureConfiguration_(ss);
  var changed = syncConfigColumns_(ss);
  refreshConsolidated_(ss);
  refreshAnalytics_(ss);
  var dyn = dynamicConfigLists_(readConfigLists_(ss)).length;
  ui.alert(
    'Configuration applied.',
    (changed
      ? 'New configuration column(s) added to every month tab; Consolidated and Analytics rebuilt.'
      : 'No new configuration columns found - dropdowns are live already.') +
    '\n\nDynamic list column(s) in use: ' + dyn + '.' +
    '\nEditing values inside a list never needs this menu - dropdowns read the Configuration tab live.',
    ui.ButtonSet.OK
  );
}

/* Canonical dynamic-column headers (month-tab cols 36+): every header
   currently present on any month tab (first-seen order - so a removed or
   renamed Configuration column keeps its data column), then any new
   Configuration-tab list headers appended. syncConfigColumns_ makes every
   month tab carry this exact sequence, which the Consolidated QUERY needs
   (its brace blocks must all be the same width). Month-tab config columns
   are managed by the script only - never reorder them by hand. */
function configHeadersOnTabs_(ss) {
  var want = dynamicConfigLists_(readConfigLists_(ss)).map(function (d) { return d.header; });
  var canonical = [];
  monthSheets_(ss).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var last = sh.getLastColumn();
    if (last < CONFIG.configFirstCol) return;
    sh.getRange(1, CONFIG.configFirstCol, 1, last - CONFIG.configFirstCol + 1)
      .getDisplayValues()[0]
      .forEach(function (h) {
        h = String(h || '').trim();
        if (h && canonical.indexOf(h) === -1) canonical.push(h);
      });
  });
  want.forEach(function (h) { if (canonical.indexOf(h) === -1) canonical.push(h); });
  return canonical;
}

/* Appends missing dynamic config columns (AJ..) to every month tab so all
   tabs carry the canonical sequence (see configHeadersOnTabs_). Returns
   the number of columns added (0 = nothing changed). Append-only: nothing
   is ever deleted - a removed/renamed Configuration column survives as an
   orphan data column; other tabs get it as an empty placeholder. */
function syncConfigColumns_(ss) {
  var months = monthSheets_(ss);
  if (!months.length) return 0;
  var canonical = configHeadersOnTabs_(ss);
  if (!canonical.length) return 0;

  var wantSet = {};
  dynamicConfigLists_(readConfigLists_(ss)).forEach(function (d) { wantSet[d.header] = true; });
  var conf = ensureConfiguration_(ss);
  var added = 0;

  months.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var have = [];
    var last = sh.getLastColumn();
    if (last >= CONFIG.configFirstCol) {
      sh.getRange(1, CONFIG.configFirstCol, 1, last - CONFIG.configFirstCol + 1)
        .getDisplayValues()[0]
        .forEach(function (h) { if (String(h || '').trim()) have.push(String(h).trim()); });
    }

    canonical.forEach(function (header) {
      if (have.indexOf(header) !== -1) return;
      var col = CONFIG.configFirstCol + have.length;
      sh.getRange(1, col).setValue(header);
      sh.getRange(2, col, CONFIG.prefillRows, 1).setNumberFormat('@');
      if (wantSet[header]) {
        var confCol = findConfigColumn_(conf, header);
        if (confCol) {
          var rule = SpreadsheetApp.newDataValidation()
            .requireValueInRange(conf.getRange(2, confCol, CONFIG.maxConfigValues, 1), true)
            .setAllowInvalid(true)
            .build();
          sh.getRange(2, col, CONFIG.prefillRows, 1).setDataValidation(rule);
        }
      }
      protectStrict_(sh.getRange(1, col).protect(), 'Config header');
      have.push(header);
      added++;
    });
  });
  return added;
}

// Configuration-tab column index (1-based) for a given list header
function findConfigColumn_(conf, header) {
  var last = conf.getLastColumn();
  if (last < 1) return 0;
  var hv = conf.getRange(1, 1, 1, last).getDisplayValues()[0];
  for (var i = 0; i < hv.length; i++) {
    if (String(hv[i] || '').trim() === header) return i + 1;
  }
  return 0;
}

function rebuildAnalyticsMenu() {
  var ss = SpreadsheetApp.getActive();
  refreshAnalytics_(ss);
  SpreadsheetApp.getUi().alert('Analytics tab rebuilt.');
}

/* Analytics tab: live QUERY pivots over Consolidated (never stores data).
    Layout: A = per inspector, D = per month, G = per meter status,
    J = non-OK meters, M+ = one "Entries per <list>" pivot per dynamic
    Configuration column (2 columns apart, re-created on every rebuild). */
function refreshAnalytics_(ss) {
  var sh = ss.getSheetByName('Analytics') || ss.insertSheet('Analytics');
  sh.clear();
  var dyn = configHeadersOnTabs_(ss); // canonical: what Consolidated carries
  var lastLetter = columnLetter_(35 + dyn.length);
  var range = 'Consolidated!A1:' + lastLetter;
  sh.getRange('A1').setValue('ANALYTICS — live pivots over Consolidated (refresh via menu)');
  sh.getRange('A1').setFontWeight('bold').setFontSize(13);
  sh.setFrozenRows(2);

  // 1. entries per inspector (all time)
  sh.getRange('A3').setValue('Entries per inspector');
  sh.getRange('A4').setFormula(
    '=IFERROR(QUERY(' + range + ', "select Col3, count(Col3) where Col3 is not null and Col3 <> \'Entered By\' group by Col3 order by count(Col3) desc label Col3 \'Inspector\', count(Col3) \'Entries\'", 0), "No entries yet")');

  // 2. entries per month
  sh.getRange('D3').setValue('Entries per month');
  sh.getRange('D4').setFormula(
    '=IFERROR(QUERY(' + range + ', "select Col35, count(Col35) where Col35 is not null and Col35 <> \'Source Tab\' group by Col35 order by Col35 desc label Col35 \'Month\', count(Col35) \'Entries\'", 0), "No entries yet")');

  // 3. entries per meter status
  sh.getRange('G3').setValue('Entries per meter status');
  sh.getRange('G4').setFormula(
    '=IFERROR(QUERY(' + range + ', "select Col26, count(Col26) where Col4 is not null and Col26 <> \'Meter Status\' group by Col26 order by count(Col26) desc label Col26 \'Status\', count(Col26) \'Entries\'", 0), "No entries yet")');

  // 4. problem meters: flagged rows per RR (any spot drift or bad PF etc. — flagged = status <> OK)
  sh.getRange('J3').setValue('Non-OK meters (needs attention)');
  sh.getRange('J4').setFormula(
    '=IFERROR(QUERY(' + range + ', "select Col26, Col4, count(Col4) where Col4 is not null and Col26 <> \'Meter Status\' and Col26 <> \'OK\' and lower(Col26) <> \'ok\' group by Col26, Col4 order by count(Col4) desc limit 25 label Col26 \'Status\', Col4 \'RR Number\', count(Col4) \'Entries\'", 0), "No entries yet")');

  // 5. feeder/DTC coverage from spot details (where entered)
  sh.getRange('N3').setValue('Spot Feeder coverage (top 20)');
  sh.getRange('N4').setFormula(
    '=IFERROR(QUERY(' + range + ', "select Col33, count(Col33) where Col33 is not null and Col33 <> \'Spot Feeder\' group by Col33 order by count(Col33) desc limit 20 label Col33 \'Spot Feeder\', count(Col33) \'Entries\'", 0), "No entries yet")');

  sh.getRange('Q3').setValue('Spot DTC coverage (top 20)');
  sh.getRange('Q4').setFormula(
    '=IFERROR(QUERY(' + range + ', "select Col32, count(Col32) where Col32 is not null and Col32 <> \'Spot DTC\' group by Col32 order by count(Col32) desc limit 20 label Col32 \'Spot DTC\', count(Col32) \'Entries\'", 0), "No entries yet")');

  // 6. one pivot per dynamic Configuration column (values are live);
  //    orphan columns (removed lists) are skipped - their Configuration
  //    column is gone, so there is no value list to group by meaningfully
  var wantSet = {};
  dynamicConfigLists_(readConfigLists_(ss)).forEach(function (d) { wantSet[d.header] = true; });
  var col = 20; // T; fixed pivots end at Q
  dyn.forEach(function (header, i) {
    if (!wantSet[header]) return;
    var idx = 36 + i;
    var letter = columnLetter_(col);
    sh.getRange(letter + '3').setValue('Entries per ' + header);
    sh.getRange(letter + '4').setFormula(
      '=IFERROR(QUERY(' + range + ', "select Col' + idx + ', count(Col' + idx + ') where Col4 is not null and Col' + idx +
      ' is not null and Col' + idx + ' <> \'' + header.replace(/'/g, "''") + '\' group by Col' + idx +
      ' order by count(Col' + idx + ') desc limit 20 label Col' + idx + ' \'' +
      header.replace(/'/g, "''") + '\', count(Col' + idx + ') \'Entries\'", 0), "No entries yet")');
    col += 2;
  });

  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
    protectStrict_(sh.protect(), 'Analytics - formula view, read-only');
  }
}

// 1-based column index -> A1 notation letter
function columnLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/* audits Master for problems the form silently tolerates today:
   duplicate RR keys, duplicate Account IDs, blank compulsory fields,
   and stray RR-SAMPLE rows still present. */
function masterHealthCheck() {
  var ss = SpreadsheetApp.getActive();
  var vals = ss.getSheetByName('Master')
    .getRange(2, 1, CONFIG.maxMasterRows, 13).getDisplayValues();

  var rrSeen = {}, accSeen = {}, dupRR = [], dupAcc = [];
  var blankFields = {}, sampleRows = 0, count = 0;
  // A rr · B account · C mrid · D md day · E sf · F name · G..J const/make/serial/phases · K..M dtc/feeder/location
  var required = ['Account ID', 'MRID', 'MD DAY', 'SF', 'Name',
    'Meter Constant', 'Meter Make', 'Meter Serial No', 'Phases',
    'DTC', 'Feeder', 'Location'];

  for (var i = 0; i < vals.length; i++) {
    var row = vals[i].map(function (c) { return c.trim(); });
    if (!row[0]) continue; // empty row
    count++;
    if (/^RR-SAMPLE/i.test(row[0])) { sampleRows++; continue; }

    var key = normalizeKey_(row[0]);
    if (rrSeen[key] !== undefined) dupRR.push('rows ' + (rrSeen[key] + 2) + ' & ' + (i + 2) + ': ' + row[0]);
    else rrSeen[key] = i;

    if (row[1]) {
      var ak = normalizeKey_(row[1]);
      if (accSeen[ak] !== undefined) dupAcc.push('rows ' + (accSeen[ak] + 2) + ' & ' + (i + 2) + ': ' + row[1]);
      else accSeen[ak] = i;
    }

    for (var c = 1; c <= 12; c++) {
      if (!row[c]) {
        var fld = required[c - 1];
        blankFields[fld] = (blankFields[fld] || 0) + 1;
      }
    }
  }

  var lines = ['Scanned ' + count + ' meter row(s) in Master.', ''];
  if (dupRR.length) {
    lines.push('DUPLICATE RR Numbers (' + dupRR.length + ') - first occurrence wins in lookups, fix these:');
    dupRR.forEach(function (d) { lines.push('  • ' + d); });
    lines.push('');
  }
  if (dupAcc.length) {
    lines.push('DUPLICATE Account IDs (' + dupAcc.length + ') - form rejects them as ambiguous:');
    dupAcc.forEach(function (d) { lines.push('  • ' + d); });
    lines.push('');
  }
  var blanks = Object.keys(blankFields);
  if (blanks.length) {
    lines.push('BLANK compulsory field(s) - RR exists but value missing:');
    blanks.forEach(function (b) { lines.push('  • ' + b + ': ' + blankFields[b] + ' row(s)'); });
    lines.push('');
  }
  if (sampleRows) lines.push('Sample rows still present: ' + sampleRows + ' (delete once real meters exist).');

  if (!dupRR.length && !dupAcc.length && !blanks.length && !sampleRows) {
    lines.push('No problems found — Master is clean. ✓');
  } else {
    lines.push('Tip: blank/duplicate values silently weaken auto-lookups and the ⚠ checks — fix them in Master.');
  }
  SpreadsheetApp.getUi().alert('Master health check', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function pickMonth_(ss, title) {
  var months = monthSheets_(ss);
  var ui = SpreadsheetApp.getUi();
  if (months.length === 0) { ui.alert('No month sheets exist yet.'); return null; }
  var res = ui.prompt(title, months.join(', '), ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;
  var name = res.getResponseText().trim();
  if (months.indexOf(name) === -1) { ui.alert('No such tab: ' + name); return null; }
  return name;
}

/* ================= web app API ================= */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Meter Inspection Register')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* identity: Team member -> { email, name, guest:false }. Unknown login ->
   { email, name:null, guest:true } - NOT blocked; the form asks for a
   name and rows go out as "Name{email}" (see Guests tab). No login e-mail
   at all (anonymous) is still refused - that cannot be traced to anyone. */
function currentUser_(ss) {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return null;
  var vals = ss.getSheetByName('Team').getRange(2, 1, CONFIG.maxTeamRows, 2).getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0].trim().toLowerCase() === email) {
      var name = vals[i][1].trim();
      return name ? { email: email, name: name, guest: false } : null;
    }
  }
  return { email: email, name: null, guest: true };
}

function getBootstrap() {
  try {
    var ss = SpreadsheetApp.getActive();
    var user = currentUser_(ss);
    if (!user) {
      // no login e-mail at all - cannot be traced, refuse
      return { ok: false, reason: 'not_authorized', email: '' };
    }

    // guests: offer their previously-typed name (if any) so the form can
    // pre-fill it; membership only changes the banner, not the flow
    if (user.guest) {
      var gv = ensureGuests_(ss).getRange(2, 1, CONFIG.maxGuestRows, 2).getDisplayValues();
      for (var g = 0; g < gv.length; g++) {
        if (String(gv[g][0] || '').trim().toLowerCase() === user.email) {
          user.name = String(gv[g][1] || '').trim() || null;
          break;
        }
      }
    }

    var meters = [];
    var mv = ss.getSheetByName('Master').getRange(2, 1, CONFIG.maxMasterRows, 13).getDisplayValues();
    for (var i = 0; i < mv.length; i++) {
      if (mv[i][0].trim()) {
        meters.push({
          rr: mv[i][0].trim(), accountId: mv[i][1].trim(), mrid: mv[i][2].trim(),
          mdDay: mv[i][3].trim(), sf: mv[i][4].trim(), name: mv[i][5].trim(),
          constant: mv[i][6].trim(), make: mv[i][7].trim(), serial: mv[i][8].trim(),
          phases: mv[i][9].trim(), dtc: mv[i][10].trim(), feeder: mv[i][11].trim(),
          spot: mv[i][12].trim()
        });
      }
    }
    var lists = readConfigLists_(ss);
    return {
      ok: true,
      user: user,
      version: CONFIG.version,
      currentMonth: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM'),
      meterStatuses: lists[CONFIG.meterStatusHeader],
      configLists: lists,
      meters: meters
    };
  } catch (err) {
    return { ok: false, reason: String(err && err.message || err) };
  }
}

function submitEntry(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActive();
    var user = currentUser_(ss);
    if (!user) return { ok: false, error: 'No login e-mail available - open the form while logged into your Google account.' };

    var chk = validatePayload_(ss, p);
    if (chk.error) return { ok: false, error: chk.error };
    var v = chk.values;

    // resolve the "Entered By" value: Team member -> plain name; guest ->
    // "Name{email}" recorded on the Guests tab (typed name required)
    var who;
    if (user.guest) {
      var gname = String(p.guestName || '').trim();
      if (!gname) return { ok: false, error: 'Enter your name (you are not in the Team list yet).' };
      if (gname.length > 60) return { ok: false, error: 'Name too long (max 60 chars).' };
      if (/[{}]/.test(gname)) return { ok: false, error: 'Name cannot contain { or }.' };
      who = recordGuest_(ss, user.email, gname);
    } else {
      who = user.name;
    }

    var tabName = Utilities.formatDate(v.date, ss.getSpreadsheetTimeZone(), 'yyyy-MM');
    var sh = ss.getSheetByName(tabName);
    if (!sh) {
      buildMonthSheet_(ss, tabName);
      sh = ss.getSheetByName(tabName);
      // a new month joined the stack; rebuild the derived views (and
      // pick up any dynamic config columns the new tab received)
      refreshConsolidated_(ss);
      refreshAnalytics_(ss);
    } else if (v.config && syncConfigColumns_(ss) > 0) {
      // a config value arrived for a column the month tabs don't have
      // yet (the form reads the Configuration tab on every load - it can
      // be ahead of the month tabs); columns were just appended - widen
      // the derived views to include them
      refreshConsolidated_(ss);
      refreshAnalytics_(ss);
    }

    var row = firstEmptyRow_(sh);
    if (row < 0) return { ok: false, error: 'Month tab "' + tabName + '" is full (1000 rows).' };

    var out = [[
      v.date, v.time, who, v.rr, v.ckwh,
      v.b[0], v.b[1], v.b[2], v.b[3], v.b[4], v.b[5],
      v.prk, v.bw[0], v.bw[1], v.bw[2], v.bw[3], v.bw[4], v.bw[5],
      v.pf, v.status || v.statusList[0], v.remarks
    ]];
    sh.getRange(row, 1, 1, 21).setValues(out);
    if (v.md) {
      var spot = [[
        v.md.constant, v.md.make, v.md.serial, v.md.phases,
        v.md.dtc, v.md.feeder, v.md.location
      ]];
      sh.getRange(row, 29, 1, 7).setValues(spot);
    }
    if (v.config) {
      // dynamic columns start at col 36 (AJ); find each header on the
      // month tab (syncConfigColumns_ keeps them in lockstep) and write
      var lastCol = sh.getLastColumn();
      if (lastCol >= CONFIG.configFirstCol) {
        var headers = sh.getRange(1, CONFIG.configFirstCol, 1, lastCol - CONFIG.configFirstCol + 1)
          .getDisplayValues()[0]
          .map(function (x) { return String(x || '').trim(); });
        Object.keys(v.config).forEach(function (h) {
          var idx = headers.indexOf(h);
          if (idx >= 0) {
            sh.getRange(row, CONFIG.configFirstCol + idx).setValue(v.config[h]);
          }
        });
      }
    }
    SpreadsheetApp.flush();

    var warnings = computeWarnings_(ss, sh, row, tabName, v, who);

    // capacity alert: tell the submitter + email the owner once at 90%
    var used = row - 1;
    var result = { ok: true, row: used, month: tabName, warnings: warnings };
    if (used >= Math.floor(CONFIG.prefillRows * 0.9)) {
      result.capacity = 'Month tab "' + tabName + '" is near capacity (' + used + '/' + CONFIG.prefillRows + ' rows).';
      result.capacityCritical = (used >= CONFIG.prefillRows - 1);
      try {
        var props = PropertiesService.getScriptProperties();
        var flag = 'capAlert_' + tabName;
        if (!props.getProperty(flag)) {
          props.setProperty(flag, String(new Date().getTime()));
          MailApp.sendEmail(
            Session.getEffectiveUser().getEmail(),
            'Meter Register: month ' + tabName + ' near capacity',
            'Month tab "' + tabName + '" has reached ' + used + ' of ' +
              CONFIG.prefillRows + ' rows.\n\n' +
              'Action: extend the month tab (add more pre-filled formula rows) ' +
              'or close the month early.\n\n' +
              '(You get this email once per month tab.)');
        }
      } catch (mailErr) { /* email is best-effort; never block the submit */ }
    }
    return result;
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

function validatePayload_(ss, p) {
  if (!p || typeof p !== 'object') return { error: 'Invalid submission.' };

  var d = parseISODate_(p.date);
  if (!d) return { error: 'Invalid date.' };
  if (d.getFullYear() < 2000 || d.getFullYear() > 2100) return { error: 'Date out of range.' };

  var time = '';
  var mTime = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(p.time || ''));
  if (mTime) time = new Date(2000, 0, 1, Number(mTime[1]), Number(mTime[2]));

  var rrRaw = String(p.rr || '').trim();
  var acRaw = String(p.accountId || '').trim();
  if (rrRaw.length > 50) return { error: 'RR Number too long.' };
  if (acRaw.length > 50) return { error: 'Account ID too long.' };
  if (!rrRaw && !acRaw) return { error: 'Enter RR Number or Account ID - at least one is required.' };

  var ckwh = num_(p.ckwh);
  if (ckwh === '') return { error: 'Reading (CKWh) is required.' };
  if (ckwh < 0) return { error: 'CKWh cannot be negative.' };

  var prk = num_(p.prk);
  if (prk === '') return { error: 'Reading (Pr kW) is required.' };
  if (prk < 0) return { error: 'Pr kW cannot be negative.' };

  var b = arr6_(p.blocksKwh), bw = arr6_(p.bkw);
  for (var i = 0; i < 6; i++) {
    if (b[i] !== '' && b[i] < 0) return { error: 'B' + (i + 1) + ' kWh cannot be negative.' };
    if (bw[i] !== '' && bw[i] < 0) return { error: 'B' + (i + 1) + ' kW cannot be negative.' };
  }

  var pf = num_(p.pf);
  if (pf !== '' && (pf < 0 || pf > 1)) return { error: 'PF must be between 0 and 1.' };

  var remarks = String(p.remarks || '').trim();
  if (remarks.length > 200) return { error: 'Remarks too long (max 200 chars).' };

  var lists = readConfigLists_(ss);

  // meter status: known value or blank (defaults to the first list value on
  // write); the list lives in the Configuration tab, col A
  var status = String(p.status || '').trim();
  var statusList = lists[CONFIG.meterStatusHeader];
  if (status && statusList.indexOf(status) === -1) {
    return { error: 'Unknown meter status "' + status + '".' };
  }

  // extra config dropdowns (Configuration columns beyond Meter Status):
  // header -> chosen value, validated against the live lists
  var config = null;
  if (p.config && typeof p.config === 'object') {
    Object.keys(p.config).forEach(function (h) {
      var val = String(p.config[h] || '').trim();
      if (!val) return;
      if (!lists[h] || lists[h].indexOf(val) === -1) {
        throw new Error('Unknown ' + h + ' value "' + val + '".');
      }
      (config = config || {})[h] = val;
    });
  }

  // optional spot-entered meter details (collapsible form section)
  var mdIn = (p && typeof p.meterDetails === 'object' && p.meterDetails) || {};
  var md = null;
  ['constant', 'make', 'serial', 'phases', 'dtc', 'feeder', 'location'].forEach(function (fld) {
    var s = String(mdIn[fld] || '').trim();
    if (s) {
      if (s.length > 50) throw new Error('Meter detail "' + fld + '" too long (max 50 chars).');
      (md = md || {})[fld] = s;
    }
  });

  // hard rule 1: RR or Account ID must resolve to exactly one Master row
  // (normalized match: case-insensitive, spaces and special characters removed)
  var mv = ss.getSheetByName('Master').getRange(2, 1, CONFIG.maxMasterRows, 2).getDisplayValues();
  var canon = {}; // normalized key -> meter info
  for (var j = 0; j < mv.length; j++) {
    var mRR = mv[j][0].trim();
    if (!mRR) continue;
    var info = { rr: mRR, acc: mv[j][1].trim() };
    if (!canon[normalizeKey_(mRR)]) canon[normalizeKey_(mRR)] = info;

    if (info.acc) {
      var an = normalizeKey_(info.acc);
      if (!canon[an]) canon[an] = info;
      else if (canon[an].rr !== mRR) canon[an].ambiguous = true;
    }
  }

  var hitRR = rrRaw ? canon[normalizeKey_(rrRaw)] : null;
  var hitAC = acRaw ? canon[normalizeKey_(acRaw)] : null;

  if (rrRaw && !hitRR) {
    return { error: 'Unknown RR Number "' + rrRaw + '" - add it to Master first.' };
  }
  if (acRaw && !hitAC) {
    return { error: 'Unknown Account ID "' + acRaw + '" - add it to Master first.' };
  }
  if (acRaw && hitAC.ambiguous) {
    return { error: 'Account ID "' + acRaw + '" matches multiple meters in Master - it must be unique.' };
  }
  var rr;
  if (rrRaw && acRaw) {
    if (hitRR.rr !== hitAC.rr) {
      return { error: 'RR Number and Account ID belong to different meters (' +
        hitRR.rr + ' vs ' + hitAC.rr + '). Fix one of them.' };
    }
    rr = hitRR.rr;
  } else if (rrRaw) {
    rr = hitRR.rr;
  } else {
    rr = hitAC.rr;
  }

  return { values: { date: d, time: time, rr: rr, ckwh: ckwh, prk: prk, b: b, bw: bw, pf: pf, status: status, statusList: statusList, remarks: remarks, md: md, config: config } };
}

// mirrors spec §6 flag rules for immediate feedback (sheet formulas re-check anyway)
function computeWarnings_(ss, sh, row, tabName, v, who) {
  var w = [];

  if (v.pf === '') w.push('PF missing');

  var sum = 0, anyBlock = false;
  for (var i = 0; i < 6; i++) if (v.b[i] !== '') { sum += v.b[i]; anyBlock = true; }
  if (anyBlock && v.ckwh !== '' && Math.abs(sum - v.ckwh) > 1.0000001) {
    w.push('Block kWh sum (' + round2_(sum) + ') differs from CKWh by more than 1');
  }

  var con = ss.getSheetByName('Consolidated');
  if (con) {
    var lr = Math.max(con.getLastRow(), 2);
    var dv = con.getRange(2, 4, lr - 1, 2).getDisplayValues(); // D=rr, E=ckwh
    var maxC = null;
    var rrN = normalizeKey_(v.rr);
    for (var k = 0; k < dv.length; k++) {
      if (normalizeKey_(dv[k][0]) === rrN && dv[k][1] !== '') {
        var c = parseFloat(dv[k][1]);
        if (!isNaN(c) && (maxC === null || c > maxC)) maxC = c;
      }
    }
    if (maxC !== null && v.ckwh < maxC) w.push('CKWh below history max (' + round2_(maxC) + ')');
  }

  if (row > 2) {
    var pv = sh.getRange(2, 1, row - 2, 4).getDisplayValues(); // A date,C by,D rr
    var dstr = Utilities.formatDate(v.date, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    for (var m = 0; m < pv.length; m++) {
      if (normalizeKey_(pv[m][3]) === rrN &&
          toISO_(pv[m][0]) === dstr &&
          pv[m][2].trim() === who) w.push('Duplicate entry');
    }
  }

  // spot-entered details vs Master (drift) — same rule as the ⚠ formula
  if (v.md) {
    var mv = ss.getSheetByName('Master').getRange(2, 1, CONFIG.maxMasterRows, 13).getDisplayValues();
    var mrow = null;
    var rrN = normalizeKey_(v.rr);
    for (var q = 0; q < mv.length; q++) {
      if (normalizeKey_(mv[q][0]) === rrN) { mrow = mv[q]; break; }
    }
    if (mrow) {
      // Master: G constant, H make, I serial, J phases, K DTC, L feeder, M location
      var masterMd = { constant: mrow[6], make: mrow[7], serial: mrow[8],
        phases: mrow[9], dtc: mrow[10], feeder: mrow[11], location: mrow[12] };
      var diffs = [];
      ['constant', 'make', 'serial', 'phases', 'dtc', 'feeder', 'location'].forEach(function (fld) {
        if (v.md[fld] && String(masterMd[fld] || '').trim() !== v.md[fld]) diffs.push(fld);
      });
      if (diffs.length) w.push('Spot details differ from Master (' + diffs.join(', ') + ') - update Master?');
    }
  }
  return w;
}

/* ================= builders ================= */

function buildMaster_(ss) {
  var sh = resetSheet_(ss, 'Master');
  sh.getRange(1, 1, 1, CONFIG.masterHeaders.length).setValues([CONFIG.masterHeaders]);
  sh.getRange(2, 1, CONFIG.masterSampleRows.length, CONFIG.masterSampleRows[0].length)
    .setValues(CONFIG.masterSampleRows);
  styleHeader_(sh, CONFIG.masterHeaders.length);
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('@');
  protectStrict_(sh.protect(), 'Master - consolidator only');
}

function buildTeam_(ss) {
  var sh = resetSheet_(ss, 'Team');
  sh.getRange(1, 1, 1, CONFIG.teamHeaders.length).setValues([CONFIG.teamHeaders]);
  sh.getRange(2, 1, CONFIG.teamSampleRows.length, CONFIG.teamSampleRows[0].length)
    .setValues(CONFIG.teamSampleRows);
  styleHeader_(sh, CONFIG.teamHeaders.length);
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('@');
  protectStrict_(sh.protect(), 'Team - consolidator only');
}

function monthSheets_(ss) {
  return ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (n) { return MONTH_RE.test(n); })
    .sort();
}

function buildMonthSheet_(ss, name) {
  var sh = resetSheet_(ss, name);
  var n = CONFIG.prefillRows;
  var cols = CONFIG.registerHeaders.length; // 26: A..Z incl. Meter Status (U) + Month (Z)
  // A..T manual · U meter status · V..Z master lookups · AA checks · AB key · AC..AI spot
  sh.getRange(1, 1, 1, cols + 2).setValues([CONFIG.registerHeaders.concat(['\u26A0 Checks', 'RR Key'])]);
  sh.getRange(1, cols + 3, 1, CONFIG.spotHeaders.length).setValues([CONFIG.spotHeaders]);
  styleHeader_(sh, cols + 10); // style A1..AI1 in one pass
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  // keep the _Keys mirror's normalization in lockstep with the tab's key
  // formulas (both must be the same generation or every lookup breaks)
  refreshKeys_(ss);

  sh.getRange('A2:A' + (n + 1)).setNumberFormat('dd-mm-yyyy');
  sh.getRange('B2:B' + (n + 1)).setNumberFormat('hh:mm am/pm');
  sh.getRange('E2:R' + (n + 1)).setNumberFormat('#,##0.00');
  sh.getRange('S2:S' + (n + 1)).setNumberFormat('0.00');
  sh.getRange(2, 28, n, 8).setNumberFormat('@'); // key + spot columns as text

  addValidations_(sh, n);
  sh.getRange(2, 22, n, 7).setFormulas(autoFormulas_(n, name)); // V..AB

  protectStrict_(sh.getRange(1, 1, 1, cols + 3 + CONFIG.spotHeaders.length).protect(), 'Header row');
  protectStrict_(sh.getRange(2, 22, n,  7).protect(), 'Auto formulas');

  // dynamic config columns (AJ..) - appended in lockstep by syncConfigColumns_
  syncConfigColumns_(ss);
  return sh;
}

function addValidations_(sh, n) {
  var ss = sh.getParent();

  var rrRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName('Master').getRange('A2:A' + CONFIG.maxMasterRows), true)
    .setAllowInvalid(true)
    .build();
  sh.getRange(2, 4, n, 1).setDataValidation(rrRule);

  // "Entered By" dropdown: Team names; guest rows carry "Name{email}"
  // which is not (and must not be) a Team value, so invalid entries are
  // allowed (warning only, never a hard block)
  var whoRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName('Team').getRange('B2:B' + CONFIG.maxTeamRows), true)
    .setAllowInvalid(true)
    .build();
  sh.getRange(2, 3, n, 1).setDataValidation(whoRule);

  var pfRule = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(0, 1)
    .setAllowInvalid(false)
    .build();
  sh.getRange(2, 19, n, 1).setDataValidation(pfRule);

  var dateRule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .build();
  sh.getRange(2, 1, n, 1).setDataValidation(dateRule);

  // meter status dropdown reads the Configuration tab column live - edit
  // the sheet and every month tab's dropdown updates instantly, no re-run
  var conf = ss.getSheetByName('Configuration') || ensureConfiguration_(ss);
  var stCol = findConfigColumn_(conf, CONFIG.meterStatusHeader) || 1;
  var stRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(conf.getRange(2, stCol, CONFIG.maxConfigValues, 1), true)
    .setAllowInvalid(true)
    .build();
  sh.getRange(2, 21, n, 1).setDataValidation(stRule); // U: Meter Status
}

/* V..Z auto lookups · AA ⚠ checks · AB hidden normalized RR key · AC..AI spot details.
   All sheet-side RR comparisons (master lookup, unknown-RR, history-max,
   duplicate) go through the normalized key (LOWER + everything except
   letters/digits removed), matching the server-side normalizeKey_() — so
   hand-edited or legacy rows with variant casing/spacing/punctuation are
   checked identically. The drift check flags Spot-* fields that disagree
   with the Master mirror (_Keys). */
function autoFormulas_(n, tab) {
  var f = [];
  for (var i = 0; i < n; i++) {
    var r = i + 2;
    var k = '$AB' + r; // normalized key
    var pair = function (spot, keyCol) {
      return 'IF(AND(' + spot + '<>"",' + spot + '<>IFERROR(VLOOKUP(' + k +
        ',_Keys!$A:$H,' + keyCol + ',FALSE),"~none~")),"Spot≠Master ","")';
    };
    f.push([
      '=IF(' + k + '="","",IFERROR(VLOOKUP(' + k + ',_Keys!$A:$E,2,FALSE),""))',
      '=IF(' + k + '="","",IFERROR(VLOOKUP(' + k + ',_Keys!$A:$E,3,FALSE),""))',
      '=IF(' + k + '="","",IFERROR(VLOOKUP(' + k + ',_Keys!$A:$E,4,FALSE),""))',
      '=IF(' + k + '="","",IFERROR(VLOOKUP(' + k + ',_Keys!$A:$E,5,FALSE),""))',
      '=IF($A' + r + '="","",TEXT($A' + r + ',"yyyy-mm"))',
      '=TRIM(' +
        'IF($D' + r + '="","",IF(COUNTIF(_Keys!$A:$A,' + k + ')=0,"Unknown RR ",""))&' +
        'IF(AND($D' + r + '<>"",$S' + r + '=""),"PF missing ","")&' +
        'IF($S' + r + '="","",IF(OR($S' + r + '<0,$S' + r + '>1),"PF out of range ",""))&' +
        'IF($E' + r + '="","",IF(IFERROR(MAXIFS(Consolidated!$E:$E,Consolidated!$AA:$AA,' + k + '),0)>$E' + r + ',"CKWh below history ",""))&' +
        'IF(AND($D' + r + '<>"",$A' + r + '<>""),IF(TEXT($A' + r + ',"yyyy-mm")<>"' + tab + '","Date not in this month ",""),"")&' +
        'IF($D' + r + '="","",IF(COUNTIFS($AB$2:$AB,' + k + ',$A$2:$A,$A' + r + ',$C$2:$C,$C' + r + ')>1,"Duplicate entry ",""))&' +
        pair('$AC' + r, 2) + '&' +
        pair('$AD' + r, 3) + '&' +
        pair('$AE' + r, 4) + '&' +
        pair('$AF' + r, 5) + '&' +
        pair('$AG' + r, 6) + '&' +
        pair('$AH' + r, 7) + '&' +
        pair('$AI' + r, 8) +
      ')',
      '=IF($D' + r + '="","",LOWER(REGEXREPLACE($D' + r + ',"[^A-Za-z0-9]","")))'
    ]);
  }
  return f;
}

/* hidden helper tab: live mirror of Master — A = normalized RR key,
   B..E = Meter Constant / Make / Serial No / Phases, F..H = DTC / Feeder /
   Location. Month tabs look up through here so normalization is computed
   once, not per cell. The key formula strips everything except letters and
   digits (spaces AND special characters), matching normalizeKey_(). */
function refreshKeys_(ss) {
  var sh = ss.getSheetByName('_Keys') || ss.insertSheet('_Keys');
  var last = CONFIG.maxMasterRows + 1;
  sh.getRange(1, 1, 1, 8).setValues([['RR Key', 'Meter Constant', 'Meter Make',
    'Meter Serial No', 'Phases', 'DTC', 'Feeder', 'Location']]);
  sh.getRange('A2').setFormula('=ARRAYFORMULA(IF(Master!A2:A' + last + '="","",LOWER(REGEXREPLACE(Master!A2:A' + last + ',"[^A-Za-z0-9]",""))))');
  sh.getRange('B2').setFormula('=ARRAYFORMULA(IF(Master!G2:G' + last + '="","",Master!G2:G' + last + '))');
  sh.getRange('C2').setFormula('=ARRAYFORMULA(IF(Master!H2:H' + last + '="","",Master!H2:H' + last + '))');
  sh.getRange('D2').setFormula('=ARRAYFORMULA(IF(Master!I2:I' + last + '="","",Master!I2:I' + last + '))');
  sh.getRange('E2').setFormula('=ARRAYFORMULA(IF(Master!J2:J' + last + '="","",Master!J2:J' + last + '))');
  sh.getRange('F2').setFormula('=ARRAYFORMULA(IF(Master!K2:K' + last + '="","",Master!K2:K' + last + '))');
  sh.getRange('G2').setFormula('=ARRAYFORMULA(IF(Master!L2:L' + last + '="","",Master!L2:L' + last + '))');
  sh.getRange('H2').setFormula('=ARRAYFORMULA(IF(Master!M2:M' + last + '="","",Master!M2:M' + last + '))');
  styleHeader_(sh, 8);
  sh.setFrozenRows(1);
  // guard like refreshConsolidated_: re-running must not stack duplicate
  // sheet protections (it now runs on every month-tab build too)
  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
    protectStrict_(sh.protect(), 'Auto-generated key mirror - do not edit');
  }
  sh.hideSheet();
  return sh;
}

// updates in place - never delete/recreate (month tabs reference it)
function refreshConsolidated_(ss) {
  var sh = ss.getSheetByName('Consolidated') || ss.insertSheet('Consolidated');
  var months = monthSheets_(ss);
  var rows = months.length * CONFIG.prefillRows + 20;
  // canonical = what the month tabs actually carry (incl. orphans)
  var dyn = configHeadersOnTabs_(ss);
  var width = Math.max(35 + dyn.length, 36);
  sh.getRange(2, 1, Math.max(rows, CONFIG.prefillRows), width).clearContent();

  // NOTE: QUERY output = month A..Z (1..26), then AB..AI (27..34: key + 7
  // spot), then Source Tab (35), then dynamic config columns (36..)
  var headers = CONFIG.registerHeaders.concat(['RR Key', 'Spot Constant', 'Spot Make',
    'Spot Serial No', 'Spot Phases', 'Spot DTC', 'Spot Feeder', 'Spot Location', 'Source Tab'])
    .concat(dyn);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh, headers.length);
  sh.setFrozenRows(1);

  if (months.length === 0) {
    sh.getRange('A2').setValue('No entries yet');
  } else {
    sh.getRange('A2').setFormula(consolidatedFormula_(months, dyn));
  }
  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
    protectStrict_(sh.protect(), 'Consolidated - formula view, read-only');
  }
}

function consolidatedFormula_(months, dyn) {
  var end = CONFIG.prefillRows + 1;
  var lastCol = columnLetter_(35 + dyn.length); // AI when no dynamic columns
  var blocks = months.map(function (m) {
    return '{"' + m + '"!A2:Z' + end + ',"' + m + '"!AB2:' + lastCol + end + ',' +
      'ARRAYFORMULA(IF("' + m + '"!D2:D' + end + '<>,"' + m + '",))}';
  });
  // A..Z (26) then AB.. (key + 7 spot + Source Tab + dynamic config
  // columns); RR Key lands at col AA (27) for MAXIFS
  return '=IFERROR(QUERY({' + blocks.join(';') + '},' +
    '"select * where Col4 is not null order by Col1 desc",0),"No entries yet")';
}

/* ================= helpers ================= */

function resetSheet_(ss, name) {
  var old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  return ss.insertSheet(name);
}

function styleHeader_(sh, cols) {
  var r = sh.getRange(1, 1, 1, cols);
  r.setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#1a73e8')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sh.setRowHeight(1, 32);
}

function protectStrict_(p, desc) {
  p.setDescription(desc);
  p.getEditors().forEach(function (e) { p.removeEditor(e); });
}

// first row where D (RR Number) is empty
function firstEmptyRow_(sh) {
  var vals = sh.getRange(2, 4, CONFIG.prefillRows, 1).getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    if (!vals[i][0].trim()) return i + 2;
  }
  return -1;
}

function parseISODate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

// case-insensitive + keeps letters/digits only (all spaces and special characters removed)
function normalizeKey_(s) {
  return String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function num_(x) {
  if (x === '' || x === null || x === undefined) return '';
  var n = Number(x);
  return isNaN(n) ? NaN : n;
}

function arr6_(a) {
  var out = [];
  a = Array.isArray(a) ? a : [];
  for (var i = 0; i < 6; i++) out.push(num_(a[i]));
  return out;
}

function toISO_(displayDate) {
  var d = parseDMY_(displayDate);
  return d ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : displayDate;
}

// parses 'dd-mm-yyyy' as displayed by sheet number format
function parseDMY_(s) {
  var m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(s || '').trim());
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function round2_(n) { return Math.round(n * 100) / 100; }
