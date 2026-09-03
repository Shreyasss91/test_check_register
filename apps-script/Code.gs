/**
 * DISTRIBUTION UTILITY METER INSPECTION REGISTER
 * Implements docs/requirements.md v2.0
 *
 * One spreadsheet (consolidator-owned) + one Apps Script Web App.
 * Inspectors use only the web form; the script writes rows on their behalf
 * and resolves "Entered By" from their Google login email via the Team tab.
 *
 * SETUP (one time, consolidator)
 *   1. Create a new Google Sheet. Extensions > Apps Script.
 *   2. Paste Code.gs. File > New > HTML file, name it exactly: Index,
 *      paste apps-script/Index.html into it. Save.
 *   3. Run setupWorkbook() once (permissions).
 *   4. Fill Team (Email + Name) and Master. Delete RR-SAMPLE rows later.
 *   5. Deploy > New deployment > Web app:
 *        Execute as: Me    Who has access: Anyone with a Google account
 *      Share that URL with inspectors. Re-deploy a NEW VERSION after edits.
 */

var CONFIG = {
  version: 'v1.5.0', // bump on every deploy; shown in the form footer
  prefillRows: 1000,
  maxMasterRows: 1000,
  maxTeamRows: 200,

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

  registerHeaders: [
    'Date', 'Time', 'Entered By', 'RR Number', 'Reading (CKWh)',
    'B1 kWh', 'B2 kWh', 'B3 kWh', 'B4 kWh', 'B5 kWh', 'B6 kWh',
    'Reading (Pr kW)', 'B1 kW', 'B2 kW', 'B3 kW', 'B4 kW', 'B5 kW', 'B6 kW',
    'PF', 'Remarks',
    'Meter Constant', 'Meter Make', 'Meter Serial No', 'Phases', 'Month'
  ],
  // spot-entered meter details (optional, from the form's collapsible section)
  spotHeaders: [
    'Spot Constant', 'Spot Make', 'Spot Serial No', 'Spot Phases',
    'Spot DTC', 'Spot Feeder', 'Spot Location'
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
    .addItem('Refresh check formulas (all months)', 'refreshCheckFormulas')
    .addSeparator()
    .addItem('Rebuild all sheets (erases data!)', 'rebuildWithConfirm')
    .addToUi();
}

/* ================= setup ================= */

function setupWorkbook() {
  var ss = SpreadsheetApp.getActive();
  buildMaster_(ss);
  buildTeam_(ss);
  refreshKeys_(ss);
  if (monthSheets_(ss).length === 0) {
    buildMonthSheet_(ss, Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM'));
  }
  refreshConsolidated_(ss);
}

function rebuildWithConfirm() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Rebuild sheets?',
    'Every tab (Master, Team, Consolidated, months) is deleted and recreated. ALL data is lost. Continue?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;
  var ss = SpreadsheetApp.getActive();
  var tmp = null;
  var known = function (n) { return MONTH_RE.test(n) || /^(Master|Team|Consolidated|_Keys)$/.test(n); };
  if (ss.getSheets().every(function (s) { return known(s.getName()); })) tmp = ss.insertSheet('temp-rebuild');
  ss.getSheets().forEach(function (s) {
    var n = s.getName();
    if (known(n)) ss.deleteSheet(s);
  });
  setupWorkbook();
  if (tmp) ss.deleteSheet(tmp);
  ui.alert('Done. Workbook rebuilt.');
}

/* ================= menu actions ================= */

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

function refreshConsolidatedMenu() {
  refreshConsolidated_(SpreadsheetApp.getActive());
  SpreadsheetApp.getUi().alert('Consolidated refreshed.');
}

// rewrites normalized-check formulas + spot columns on every month tab (incl. old ones)
function refreshCheckFormulas() {
  var ss = SpreadsheetApp.getActive();
  var months = monthSheets_(ss);
  months.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    sh.getRange(1, 27, 1, CONFIG.spotHeaders.length + 1).setValues([['RR Key'].concat(CONFIG.spotHeaders)]);
    sh.getRange(2, 21, CONFIG.prefillRows, 7).setFormulas(autoFormulas_(CONFIG.prefillRows, name));
  });
  SpreadsheetApp.getUi().alert('Check formulas refreshed on ' + months.length + ' month tab(s).');
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

// identity: login email must exist in Team!A
function currentUser_(ss) {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) return null;
  var vals = ss.getSheetByName('Team').getRange(2, 1, CONFIG.maxTeamRows, 2).getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0].trim().toLowerCase() === email) {
      var name = vals[i][1].trim();
      return name ? { email: email, name: name } : null;
    }
  }
  return null;
}

function getBootstrap() {
  try {
    var ss = SpreadsheetApp.getActive();
    var user = currentUser_(ss);
    if (!user) {
      var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
      return { ok: false, reason: 'not_authorized', email: email };
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
    return {
      ok: true,
      user: user,
      version: CONFIG.version,
      currentMonth: Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM'),
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
    if (!user) return { ok: false, error: 'Your e-mail is not in the Team list. Ask the admin to add your e-mail to the list, or log in with an approved e-mail.' };

    var chk = validatePayload_(ss, p);
    if (chk.error) return { ok: false, error: chk.error };
    var v = chk.values;

    var tabName = Utilities.formatDate(v.date, ss.getSpreadsheetTimeZone(), 'yyyy-MM');
    var sh = ss.getSheetByName(tabName);
    if (!sh) {
      buildMonthSheet_(ss, tabName);
      refreshConsolidated_(ss);
      sh = ss.getSheetByName(tabName);
    }

    var row = firstEmptyRow_(sh);
    if (row < 0) return { ok: false, error: 'Month tab "' + tabName + '" is full (1000 rows).' };

    var out = [[
      v.date, v.time, user.name, v.rr, v.ckwh,
      v.b[0], v.b[1], v.b[2], v.b[3], v.b[4], v.b[5],
      v.prk, v.bw[0], v.bw[1], v.bw[2], v.bw[3], v.bw[4], v.bw[5],
      v.pf, v.remarks
    ]];
    sh.getRange(row, 1, 1, 20).setValues(out);
    if (v.md) {
      var spot = [[
        v.md.constant, v.md.make, v.md.serial, v.md.phases,
        v.md.dtc, v.md.feeder, v.md.location
      ]];
      sh.getRange(row, 28, 1, 7).setValues(spot);
    }
    SpreadsheetApp.flush();

    var warnings = computeWarnings_(ss, sh, row, tabName, v, user.name);

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
  // (normalized match: case-insensitive, all spaces removed)
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

  return { values: { date: d, time: time, rr: rr, ckwh: ckwh, prk: prk, b: b, bw: bw, pf: pf, remarks: remarks, md: md } };
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
    var rrLower = v.rr.toLowerCase();
    for (var k = 0; k < dv.length; k++) {
      if (dv[k][0].trim().toLowerCase() === rrLower && dv[k][1] !== '') {
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
      if (pv[m][3].trim().toLowerCase() === v.rr.toLowerCase() &&
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
  var cols = CONFIG.registerHeaders.length;
  // A..T manual · U..Y master lookups · Z checks · AA key · AB..AH spot details
  sh.getRange(1, 1, 1, cols + 1).setValues([CONFIG.registerHeaders.concat(['\u26A0 Checks'])]);
  sh.getRange(1, 27, 1, CONFIG.spotHeaders.length + 1).setValues([['RR Key'].concat(CONFIG.spotHeaders)]);
  styleHeader_(sh, cols + 9); // style A1..AH1 (25 data + checks + key + 7 spot) in one pass
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  sh.getRange('A2:A' + (n + 1)).setNumberFormat('dd-mm-yyyy');
  sh.getRange('B2:B' + (n + 1)).setNumberFormat('hh:mm am/pm');
  sh.getRange('E2:R' + (n + 1)).setNumberFormat('#,##0.00');
  sh.getRange('S2:S' + (n + 1)).setNumberFormat('0.00');
  sh.getRange(2, 27, n, 8).setNumberFormat('@');

  addValidations_(sh, n);
  sh.getRange(2, 21, n, 7).setFormulas(autoFormulas_(n, name));

  protectStrict_(sh.getRange(1, 1, 1, cols + 1).protect(), 'Header row');
  protectStrict_(sh.getRange(1, 27, 1, CONFIG.spotHeaders.length + 1).protect(), 'Spot header row');
  protectStrict_(sh.getRange(2, 21, n, 7).protect(), 'Auto formulas');
}

function addValidations_(sh, n) {
  var ss = sh.getParent();

  var rrRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName('Master').getRange('A2:A' + CONFIG.maxMasterRows), true)
    .setAllowInvalid(true)
    .build();
  sh.getRange(2, 4, n, 1).setDataValidation(rrRule);

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
}

/* U..Y auto lookups · Z ⚠ checks · AA hidden normalized RR key · AB..AH spot details.
   All sheet-side RR comparisons (master lookup, unknown-RR, history-max,
   duplicate) go through the normalized key (LOWER + all spaces removed),
   matching the server-side normalizeKey_() — so hand-edited or legacy rows
   with variant casing/spacing are checked identically. The drift check
   flags Spot-* fields that disagree with the Master mirror (_Keys). */
function autoFormulas_(n, tab) {
  var f = [];
  for (var i = 0; i < n; i++) {
    var r = i + 2;
    var k = '$AA' + r; // normalized key
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
        'IF($E' + r + '="","",IF(IFERROR(MAXIFS(Consolidated!$E:$E,Consolidated!$Z:$Z,' + k + '),0)>$E' + r + ',"CKWh below history ",""))&' +
        'IF(AND($D' + r + '<>"",$A' + r + '<>""),IF(TEXT($A' + r + ',"yyyy-mm")<>"' + tab + '","Date not in this month ",""),"")&' +
        'IF($D' + r + '="","",IF(COUNTIFS($AA$2:$AA,' + k + ',$A$2:$A,$A' + r + ',$C$2:$C,$C' + r + ')>1,"Duplicate entry ",""))&' +
        pair('$AB' + r, 2) + '&' +
        pair('$AC' + r, 3) + '&' +
        pair('$AD' + r, 4) + '&' +
        pair('$AE' + r, 5) + '&' +
        pair('$AF' + r, 6) + '&' +
        pair('$AG' + r, 7) + '&' +
        pair('$AH' + r, 8) +
      ')',
      '=IF($D' + r + '="","",LOWER(SUBSTITUTE($D' + r + '," ","")))'
    ]);
  }
  return f;
}

/* hidden helper tab: live mirror of Master — A = normalized RR key,
   B..E = Meter Constant / Make / Serial No / Phases, F..H = DTC / Feeder /
   Location. Month tabs look up through here so normalization is computed
   once, not per cell. */
function refreshKeys_(ss) {
  var sh = ss.getSheetByName('_Keys') || ss.insertSheet('_Keys');
  var last = CONFIG.maxMasterRows + 1;
  sh.getRange(1, 1, 1, 8).setValues([['RR Key', 'Meter Constant', 'Meter Make',
    'Meter Serial No', 'Phases', 'DTC', 'Feeder', 'Location']]);
  sh.getRange('A2').setFormula('=ARRAYFORMULA(IF(Master!A2:A' + last + '="","",LOWER(SUBSTITUTE(Master!A2:A' + last + '," ",""))))');
  sh.getRange('B2').setFormula('=ARRAYFORMULA(IF(Master!G2:G' + last + '="","",Master!G2:G' + last + '))');
  sh.getRange('C2').setFormula('=ARRAYFORMULA(IF(Master!H2:H' + last + '="","",Master!H2:H' + last + '))');
  sh.getRange('D2').setFormula('=ARRAYFORMULA(IF(Master!I2:I' + last + '="","",Master!I2:I' + last + '))');
  sh.getRange('E2').setFormula('=ARRAYFORMULA(IF(Master!J2:J' + last + '="","",Master!J2:J' + last + '))');
  sh.getRange('F2').setFormula('=ARRAYFORMULA(IF(Master!K2:K' + last + '="","",Master!K2:K' + last + '))');
  sh.getRange('G2').setFormula('=ARRAYFORMULA(IF(Master!L2:L' + last + '="","",Master!L2:L' + last + '))');
  sh.getRange('H2').setFormula('=ARRAYFORMULA(IF(Master!M2:M' + last + '="","",Master!M2:M' + last + '))');
  styleHeader_(sh, 8);
  sh.setFrozenRows(1);
  protectStrict_(sh.protect(), 'Auto-generated key mirror - do not edit');
  sh.hideSheet();
  return sh;
}

// updates in place - never delete/recreate (month tabs reference it)
function refreshConsolidated_(ss) {
  var sh = ss.getSheetByName('Consolidated') || ss.insertSheet('Consolidated');
  var months = monthSheets_(ss);
  var rows = months.length * CONFIG.prefillRows + 20;
  sh.getRange(2, 1, Math.max(rows, CONFIG.prefillRows), 34).clearContent();

  var headers = CONFIG.registerHeaders.concat(['RR Key', 'Spot Constant', 'Spot Make',
    'Spot Serial No', 'Spot Phases', 'Spot DTC', 'Spot Feeder', 'Spot Location', 'Source Tab']);
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

function consolidatedFormula_(months) {
  var end = CONFIG.prefillRows + 1;
  var blocks = months.map(function (m) {
    return '{"' + m + '"!A2:Y' + end + ',"' + m + '"!AA2:AH' + end + ',' +
      'ARRAYFORMULA(IF("' + m + '"!D2:D' + end + '<>,"' + m + '",))}';
  });
  // col 26 = Z = RR Key; spot details at cols 27..33; source tab at 34
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

// case-insensitive + all spaces (leading/trailing/middle) removed
function normalizeKey_(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
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
