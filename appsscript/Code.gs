/**
 * Job Radar backend.
 *
 * Two jobs:
 *   1. Store your applied and dismissed marks in this spreadsheet.
 *   2. Serve the digest that the scheduled run publishes to Google Drive.
 *
 * Deploy as a Web app bound to the tracker spreadsheet. See SETUP.md.
 *
 * Security model: a single shared secret sent in the request body. This is not
 * strong auth. It stops casual discovery of the endpoint URL from letting anyone
 * write to your sheet. The secret is visible in the site's page source, which is
 * unavoidable for a static site. Keep nothing sensitive here.
 */

var SECRET      = '3e2e369750e26cbbcbcd57e5daf50cef6a8175d18385cd56';
var SHEET_NAME  = 'state';
var DIGEST_FILE = 'jobradar_data.json';
var HEADERS     = ['Link', 'Status', 'Date', 'Role', 'Company', 'Updated'];

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
    if (body.action === 'digest') {
      return json({ ok: true, digest: readDigest() });
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

/* ---------- digest, published to Drive by the scheduled run ---------- */

function readDigest() {
  var it = DriveApp.getFilesByName(DIGEST_FILE);
  var newest = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    if (!newest || f.getLastUpdated() > newest.getLastUpdated()) newest = f;
  }
  if (!newest) return null;
  try {
    return JSON.parse(newest.getBlob().getDataAsString());
  } catch (err) {
    throw new Error('digest file is not valid JSON: ' + err.message);
  }
}

/* Run this once from the editor to confirm Drive access and the digest parse. */
function testDigest() {
  var d = readDigest();
  Logger.log(d ? 'digest run ' + d.run + ', software ' +
                 ((d.software || []).length) + ', hardware ' +
                 ((d.hardware || []).length)
               : 'no digest file found named ' + DIGEST_FILE);
}

/* ---------- tracker state ---------- */

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('script is not bound to a spreadsheet');
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
    if (!v[0] || !v[1]) continue;
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
