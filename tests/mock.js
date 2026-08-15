/* Mock Apps Script endpoint: same contract as Code.gs, plus failure toggles. */
const http = require('http');

const SECRET = 'test-secret-123';
let rows = [];          // {link,status,date,role,company}
let mode = 'ok';        // 'ok' | 'fail' | 'badsecret'
const log = [];

const server = http.createServer((req, res) => {
  // permissive CORS, same as ContentService output in practice
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {          // must never be needed by the client
    log.push('PREFLIGHT');
    res.writeHead(405).end();
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/__ctl')) {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.has('mode')) mode = u.searchParams.get('mode');
    if (u.searchParams.has('reset')) { rows = []; log.length = 0; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mode, rows, log }));
    return;
  }

  let body = '';
  req.on('data', c => (body += c));
  req.on('end', () => {
    log.push(req.method + ' ct=' + (req.headers['content-type'] || ''));
    if (mode === 'fail') { res.writeHead(500).end('boom'); return; }

    let p = {};
    try { p = JSON.parse(body); } catch (e) {}
    const send = o => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(o));
    };
    if (mode === 'badsecret' || p.secret !== SECRET) return send({ error: 'bad secret' });
    if (p.action === 'list') return send({ ok: true, rows });
    if (p.action === 'set') {
      rows = rows.filter(r => r.link !== p.link);
      if (p.status) rows.push({ link: p.link, status: p.status, date: p.date, role: p.role, company: p.company });
      return send({ ok: true });
    }
    send({ error: 'unknown action' });
  });
});

server.listen(8898, () => console.log('mock on 8898'));
