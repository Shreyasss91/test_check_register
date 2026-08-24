/**
 * DISTRIBUTION UTILITY METER INSPECTION REGISTER — workbook generator
 * Implements docs/requirements.md v1.1
 *
 * Structure: one spreadsheet, tabs per month (YYYY-MM), shared by all
 * inspectors; Master + Team maintained by the consolidator; Consolidated
 * stacks all months live.
 *
 * SETUP (one time, done by the consolidator)
 *   1. Create a new Google Sheet.
 *   2. Extensions > Apps Script → paste this file, save.
 *   3. Run setupWorkbook() once, approve permissions.
 *   4. Fill "Team" with inspector names and "Master" with meters.
 *   5. Share the file (Editor) with all inspectors.
 *   Monthly routine: menu Meter Register > New month sheet / Close month.
 */

var CONFIG = {
  prefillRows: 1000,
  maxMasterRows: 1000,
  maxTeamRows: 200,

  masterHeaders: [
    'RR Number', 'Meter Constant', 'Meter Make', 'Meter Serial No',
    'Phases', 'Spot / Feeder', 'Notes'
  ],
  masterSampleRows: [
    ['RR-SAMPLE-01', '11', 'L&T', 'LT12345', '3', 'Feeder A',
      'sample row - edit or delete'],
    ['RR-SAMPLE-02', '22', 'Secura', 'SE67890', '1', 'Feeder B', '']
  ],

  teamHeader: ['Entered By'],

  // A..T manual entry, U..Y auto formulas, Z checks
  registerHeaders: [
    'Date', 'Time', 'Entered By', 'RR Number', 'Reading (CKWh)',
    'B1 kWh', 'B2 kWh', 'B3 kWh', 'B4 kWh', 'B5 kWh', 'B6 kWh',
    'Reading (Pr kW)', 'B1 kW', 'B2 kW', 'B3 kW', 'B4 kW', 'B5 kW', 'B6 kW',
    'PF', 'Remarks',
    'Meter Constant', 'Meter Make', 'Meter Serial No', 'Phases', 'Month'
  ]
};

var MONTH_RE = /^\d{4}-\d{2}$/;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Meter Register')
    .addItem('New month sheet…', 'newMonthSheet')
    .addItem('Close month (lock)…', 'closeMonth')
    .addItem('Unlock month (corrections)…', 'unlockMonth')
    .addItem('Refresh Consolidated', 'refreshConsolidatedMenu')
    .addSeparator()
    .addItem('Rebuild core sheets (erases data!)', 'rebuildWithConfirm')
    .addToUi();
}

/* ---------- setup ---------- */

function setupWorkbook() {
  var ss = SpreadsheetApp.getActive();
  buildMaster_(ss);
  buildTeam_(ss);
  var months = monthSheets_(ss);
  if (months.length === 0) {
    buildMonthSheet_(ss, Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM'));
  }
  refreshConsolidated_(ss);
}

function rebuildWithConfirm() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Rebuild core sheets?',
    'Every tab (Master, Team, Consolidated and all months) is deleted and recreated. All recorded data will be lost. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  var ss = SpreadsheetApp.getActive();
  // keep at least one sheet alive while we delete the rest
  var tmp = null;
  if (ss.getSheets().every(function (s) { return MONTH_RE.test(s.getName()) || /^(Master|Team|Consolidated)$/.test(s.getName()); })) {
    tmp = ss.insertSheet('temp-rebuild');
  }
  ss.getSheets().forEach(function (s) {
    var n = s.getName();
    if (MONTH_RE.test(n) || /^(Master|Team|Consolidated)$/.test(n)) ss.deleteSheet(s);
  });
  setupWorkbook();
  if (tmp) ss.deleteSheet(tmp);
  ui.alert('Done. Workbook rebuilt.');
}

/* ---------- menu actions ---------- */

function newMonthSheet() {
  var ss = SpreadsheetApp.getActive();
  var ui = SpreadsheetApp.getUi();
  var def = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM');
  var res = ui.prompt('New month sheet', 'Tab name (YYYY-MM):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var name = res.getResponseText().trim();
  if (!MONTH_RE.test(name)) {
    ui.alert('Rejected: name must be YYYY-MM, e.g. ' + def);
    return;
  }
  if (ss.getSheetByName(name)) {
    ui.alert('Tab "' + name + '" already exists.');
    return;
  }
  buildMonthSheet_(ss, name);
  refreshConsolidated_(ss);
  ss.setActiveSheet(ss.getSheetByName(name));
}

function closeMonth() {
  var ss = SpreadsheetApp.getActive();
  var name = pickMonth_(ss, 'Close (lock) which month?');
  if (!name) return;
  var sh = ss.getSheetByName(name);
  var p = sh.protect();
  p.setDescription('Closed month - locked by consolidator');
  p.getEditors().forEach(function (e) { p.removeEditor(e); });
  SpreadsheetApp.getUi().alert(
    '"' + name + '" is locked. Tip: File > Download > Microsoft Excel for the archive backup.'
  );
}

function unlockMonth() {
  var ss = SpreadsheetApp.getActive();
  var name = pickMonth_(ss, 'Unlock which month for corrections?');
  if (!name) return;
  var sh = ss.getSheetByName(name);
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
    p.remove();
  });
  SpreadsheetApp.getUi().alert('"' + name + '" unlocked. Close it again when done.');
}

function refreshConsolidatedMenu() {
  refreshConsolidated_(SpreadsheetApp.getActive());
  SpreadsheetApp.getUi().alert('Consolidated refreshed.');
}

function pickMonth_(ss, title) {
  var months = monthSheets_(ss);
  if (months.length === 0) {
    SpreadsheetApp.getUi().alert('No month sheets exist yet.');
    return null;
  }
  var res = SpreadsheetApp.getUi().prompt(title, months.join(', '), SpreadsheetApp.getUi().ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== SpreadsheetApp.getUi().Button.OK) return null;
  var name = res.getResponseText().trim();
  if (months.indexOf(name) === -1) {
    SpreadsheetApp.getUi().alert('No such month tab: ' + name);
    return null;
  }
  return name;
}

/* ---------- builders ---------- */

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
  sh.getRange(1, 1, 1, 1).setValues([CONFIG.teamHeader]);
  styleHeader_(sh, 1);
  sh.setFrozenRows(1);
  protectStrict_(sh.protect(), 'Team list - consolidator only');
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
  var cols = CONFIG.registerHeaders.length; // 25 data cols; Z = checks
  sh.getRange(1, 1, 1, cols + 1).setValues([CONFIG.registerHeaders.concat(['\u26A0 Checks'])]);
  styleHeader_(sh, cols + 1);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  sh.getRange('A2:A' + (n + 1)).setNumberFormat('dd-mm-yyyy');
  sh.getRange('B2:B' + (n + 1)).setNumberFormat('hh:mm am/pm');
  sh.getRange('E2:R' + (n + 1)).setNumberFormat('#,##0.00');
  sh.getRange('S2:S' + (n + 1)).setNumberFormat('0.00');

  addValidations_(sh, n);

  // auto columns U..Z (21..26)
  sh.getRange(2, 21, n, 6).setFormulas(autoFormulas_(n, name));

  protectStrict_(sh.getRange(1, 1, 1, cols + 1).protect(), 'Header row');
  protectStrict_(sh.getRange(2, 21, n, 6).protect(), 'Auto formulas');
}

function addValidations_(sh, n) {
  var ss = sh.getParent();

  var rrRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName('Master').getRange('A2:A' + CONFIG.maxMasterRows), true)
    .setAllowInvalid(false)
    .setHelpText('Pick an RR Number that exists in Master.')
    .build();
  sh.getRange(2, 4, n, 1).setDataValidation(rrRule);

  var whoRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName('Team').getRange('A2:A' + CONFIG.maxTeamRows), true)
    .setAllowInvalid(false)
    .setHelpText('Pick your name from the Team list.')
    .build();
  sh.getRange(2, 3, n, 1).setDataValidation(whoRule);

  var pfRule = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(0, 1)
    .setAllowInvalid(false)
    .setHelpText('PF must be between 0 and 1.')
    .build();
  sh.getRange(2, 19, n, 1).setDataValidation(pfRule);

  var dateRule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .setHelpText('Enter a valid date (dd-mm-yyyy).')
    .build();
  sh.getRange(2, 1, n, 1).setDataValidation(dateRule);
}

// U constant, V make, W serial, X phases, Y month, Z checks — rows 2..n+1
function autoFormulas_(n, tab) {
  var f = [];
  for (var i = 0; i < n; i++) {
    var r = i + 2;
    f.push([
      '=IFERROR(VLOOKUP($D' + r + ',Master!$A:$E,2,FALSE),"")',
      '=IFERROR(VLOOKUP($D' + r + ',Master!$A:$E,3,FALSE),"")',
      '=IFERROR(VLOOKUP($D' + r + ',Master!$A:$E,4,FALSE),"")',
      '=IFERROR(VLOOKUP($D' + r + ',Master!$A:$E,5,FALSE),"")',
      '=IF($A' + r + '="","",TEXT($A' + r + ',"yyyy-mm"))',
      '=TRIM(' +
        'IF($D' + r + '="","",IF(COUNTIF(Master!$A:$A,$D' + r + ')=0,"Unknown RR ",""))&' +
        'IF(AND($D' + r + '<>"",$S' + r + '=""),"PF missing ","")&' +
        'IF($S' + r + '="","",IF(OR($S' + r + '<0,$S' + r + '>1),"PF out of range ",""))&' +
        'IF($E' + r + '="","",IF(IFERROR(MAXIFS(Consolidated!$E:$E,Consolidated!$D:$D,$D' + r + '),0)>$E' + r + ',"CKWh below history ",""))&' +
        'IF(AND($D' + r + '<> "",$A' + r + '<>""),IF(TEXT($A' + r + ',"yyyy-mm")<>"' + tab + '","Date not in this month ",""),"")&' +
        'IF($D' + r + '="","",IF(COUNTIFS($D$2:$D,$D' + r + ',$A$2:$A,$A' + r + ',$C$2:$C,$C' + r + ')>1,"Duplicate entry ",""))' +
      ')'
    ]);
  }
  return f;
}

// updates in place - never delete/recreate this tab, because month tabs'
// check formulas reference Consolidated!E:E (deleting would leave #REF!)
function refreshConsolidated_(ss) {
  var sh = ss.getSheetByName('Consolidated') || ss.insertSheet('Consolidated');
  var months = monthSheets_(ss);
  var rows = months.length * CONFIG.prefillRows + 20;
  sh.getRange(2, 1, Math.max(rows, CONFIG.prefillRows), 26).clearContent();

  var headers = CONFIG.registerHeaders.concat(['Source Tab']);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh, headers.length);
  sh.setFrozenRows(1);

  if (months.length === 0) {
    sh.getRange('A2').setValue('No entries yet');
  } else {
    sh.getRange('A2').setFormula(consolidatedFormula_(months));
  }
  if (sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
    protectStrict_(sh.protect(), 'Consolidated - formula view, read-only');
  }
}

// stacks each month's A2:Y + a literal source-tab column -> 26 output cols
function consolidatedFormula_(months) {
  var end = CONFIG.prefillRows + 1;
  var blocks = months.map(function (m) {
    return '{"' + m + '"!A2:Y' + end +
      ',ARRAYFORMULA(IF("' + m + '"!D2:D' + end + '<>,"' + m + '",))}';
  });
  return '=IFERROR(QUERY({' + blocks.join(';') + '},' +
    '"select * where Col4 is not null order by Col1 desc",0),"No entries yet")';
}

/* ---------- helpers ---------- */

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
  // owner (consolidator) keeps edit rights automatically
}
