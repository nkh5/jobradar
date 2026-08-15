/**
 * Job Radar tracker backend.
 *
 * Deploy this as a Web app bound to the Google Sheet that stores your
 * applied and dismissed state. See SETUP.md step 4.
 *
 * Security model: a single shared secret sent in the request body. This is
 * not strong auth. It stops casual discovery of the endpoint URL from letting
 * anyone write to your sheet. Do not store anything sensitive here, and do
 * not commit the secret to the public repo.
 */

var SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_STRING';
var SHEET_NAME = 'state';
var HEADERS = ['Link', 'Status', 'Date', 'Role', 'Company', 'Updated'];

/* ---------- entry points ---------- */

function doGet() {
  return json({ ok: true, service: 'jobradar', hint: 'Use POST.' });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ error: 'empty body' });
    }
    var body = JSON.parse(e.postData.contents);

    if (body.secret !== SECRET) {
      return json({ error: 'bad secret' });
    }

    if (body.action === 'list') {
      return json({ ok: true, rows: readAll() });
    }
    if (body.action === 'set') {
      if (!body.link) return json({ error: 'missing link' });
      upsert(body);
      return json({ ok: true });
    }
    return json({ error: 'unknown action: ' + body.action });

  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) });
  }
}

/* ---------- sheet access ---------- */

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll() {
  var sh = sheet();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (!v[0]) continue;
    if (!v[1]) continue;              /* cleared rows are skipped */
    rows.push({
      link: String(v[0]),
      status: String(v[1]),
      date: v[2] ? fmt(v[2]) : '',
      role: String(v[3] || ''),
      company: String(v[4] || '')
    });
  }
  return rows;
}

function upsert(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet();
    var last = sh.getLastRow();
    var rowIndex = -1;

    if (last >= 2) {
      var links = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < links.length; i++) {
        if (String(links[i][0]) === body.link) { rowIndex = i + 2; break; }
      }
    }

    var row = [
      body.link,
      body.status || '',
      body.date || '',
      body.role || '',
      body.company || '',
      new Date()
    ];

    if (rowIndex > 0) {
      /* preserve role and company if this call did not supply them */
      var old = sh.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
      if (!row[3]) row[3] = old[3];
      if (!row[4]) row[4] = old[4];
      sh.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---------- util ---------- */

function fmt(d) {
  if (Object.prototype.toString.call(d) !== '[object Date]') return String(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
