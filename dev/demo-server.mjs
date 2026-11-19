// Local demo server: runs the website + admin panel against a fake in-memory
// database, so you can try everything without a Supabase account.
//   node dev/demo-server.mjs        → http://localhost:8765  and  /admin/
//   node dev/demo-server.mjs --real → plain static server on :3000 using your real
//                                     Supabase project from cms-config.js
// Nothing is saved: restarting the server resets the data. Form emails are
// switched off in demo mode. No login needed (you're signed in as a demo admin).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEV = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DEV, '..');
const REAL = process.argv.includes('--real');
const PORT = Number(process.env.PORT) || (REAL ? 3000 : 8765);
const now = () => new Date().toISOString();
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();

const db = {
  site_content: [],
  events: [
    { title: 'Anarkali Marikar Remix', category: 'upcoming', tagline: 'New Year Party • Maidstone Leisure Centre', summary: 'Celebrate the New Year with a spectacular live music performance by Anarkali Marikar and band!', image_url: 'assets/anarkali_marikar_live.jpg', date_day: '03', date_month: 'JAN', date_year: '2027', status_pill: '🎉 New Year 2027', pill_style: 'upcoming', time_label: '⏰ Gate Opens: 5:00 PM', location: '📍 Maidstone Leisure Centre, ME15 7RN', badges: ['🎧 Live DJ', '🍛 Food Stall'], booking_mode: 'tickets', booking_url: 'https://littlecrew.crowdpass.co.uk/', phone: '+447388890443', artist: 'Anarkali Marikar & Live Band', description: 'Demo copy of the New Year party event.', cta_text: 'Book Tickets on CrowdPass 🎟️' },
    { title: 'Sooraj Santhosh Live', category: 'upcoming', tagline: 'One Voice, A Thousand Emotions • Stay Tuned', summary: 'Landmark tour across the UK and Ireland.', image_url: 'assets/sooraj_santhosh_tour.jpg', date_day: 'MAY', date_month: 'TOUR', date_year: '2027', status_pill: '⚡ UK & Ireland Tour', pill_style: 'tour', time_label: '🗓️ May 2027', location: '📍 UK & Ireland Tour', badges: ['Little Crew Presents'], booking_mode: 'waitlist', phone: '+447388890443', artist: 'Sooraj Santhosh', description: 'Demo copy — booking not open yet, so the popup shows the waitlist form.', cta_text: 'Join Waitlist 📝' },
    { title: 'Tun Fun Nights', category: 'past', tagline: 'The Ultimate Multilingual DJ Night • Concluded', summary: 'Live, loud, and unlimited fun at Aura Bar & Club.', image_url: 'assets/tun_fun_nights.jpg', date_day: '25', date_month: 'JUL', date_year: '2026', status_pill: '✓ Concluded', pill_style: 'past', time_label: '⏰ 08:00 PM', location: '📍 Aura Bar & Club, Tunbridge Wells', badges: ['DJ JULIX'], booking_mode: 'enquiry', artist: 'DJ Julix', description: 'Demo copy of a past event.', cta_text: 'Inquire for Future Events' }
  ].map((e, i) => ({ id: crypto.randomUUID(), published: true, featured: e.category !== 'past', sort_order: i + 1, created_at: now(), ...e })),
  submissions: [
    { form: 'contact', name: 'Sample Person', email: 'sample@example.com', phone: '+44 7000 000001', subject: 'Media Production', message: 'Hi, we would like a promo video for our launch.', status: 'new', created_at: daysAgo(0) },
    { form: 'booking', name: 'Test Booker', email: 'booker@example.com', subject: 'Event enquiry: Sooraj Santhosh Live', event_title: 'Sooraj Santhosh Live', message: 'Time: May 2027', status: 'new', created_at: daysAgo(1) },
    { form: 'contact', name: 'Another Visitor', email: 'visitor@example.com', subject: 'Other', message: 'General question about sponsorship.', status: 'read', created_at: daysAgo(3) }
  ].map(s => ({ id: crypto.randomUUID(), phone: null, postcode: null, event_title: null, ...s }))
};

const match = (row, filters = []) => filters.every(([op, c, v]) =>
  op === 'eq' ? String(row[c]) === String(v) : v.map(String).includes(String(row[c])));

function exec(q) {
  const rows = db[q.t];
  if (!rows) throw new Error('Unknown table ' + q.t);
  const pk = q.t === 'site_content' ? 'key' : 'id';
  switch (q.action) {
    case 'select': {
      let out = rows.filter(r => match(r, q.f));
      for (const [c, asc] of [...(q.o || [])].reverse()) {
        out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
      }
      return q.r ? out.slice(q.r[0], q.r[1] + 1) : out;
    }
    case 'insert': {
      const vals = [].concat(q.values).map(v => ({
        id: crypto.randomUUID(), created_at: now(),
        ...(q.t === 'submissions' ? { status: 'new' } : {}), ...v
      }));
      rows.push(...vals);
      return vals;
    }
    case 'update': {
      const hit = rows.filter(r => match(r, q.f));
      hit.forEach(r => Object.assign(r, q.values));
      return hit;
    }
    case 'delete':
      db[q.t] = rows.filter(r => !match(r, q.f));
      return [];
    case 'upsert':
      [].concat(q.values).forEach(v => {
        const existing = rows.find(r => r[pk] === v[pk]);
        existing ? Object.assign(existing, v) : rows.push(v);
      });
      return q.values;
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => {
    const send = (code, type, data) => { res.writeHead(code, { 'content-type': type }); res.end(data); };
    const json = (o, code = 200) => send(code, 'application/json', JSON.stringify(o));
    try {
      if (REAL) return serveStatic();
      // Fake config: points the site at this server, and turns off real emails
      if (u.pathname === '/cms-config.js') {
        return send(200, 'text/javascript',
          `window.CMS_CONFIG={SUPABASE_URL:'http://localhost:${PORT}/__fake/',SUPABASE_ANON_KEY:'demo-key',DISABLE_EMAIL:true};`);
      }
      // Admin panel with the fake Supabase client swapped in
      if (u.pathname === '/admin' || u.pathname === '/admin/' || u.pathname === '/admin/index.html') {
        if (!u.pathname.endsWith('/') && !u.pathname.endsWith('.html')) { res.writeHead(302, { location: '/admin/' }); return res.end(); }
        const html = fs.readFileSync(path.join(ROOT, 'admin/index.html'), 'utf8')
          .replace(/<script src="https:\/\/cdn\.jsdelivr[^"]+"><\/script>/, '<script src="/__dev/mock-supabase.js"></script>');
        return send(200, 'text/html', html);
      }
      if (u.pathname === '/__dev/mock-supabase.js') return send(200, 'text/javascript', fs.readFileSync(path.join(DEV, 'mock-supabase.js')));
      if (u.pathname === '/__dev/query') {
        const q = JSON.parse(body);
        const data = exec(q);
        return json({ data: q.one ? data[0] : data, error: null });
      }
      // Fake Supabase REST API used by the public site
      const m = u.pathname.match(/^\/__fake\/rest\/v1\/(\w+)$/);
      if (m) {
        if (req.method === 'POST') {
          console.log(`[demo] new ${m[1]} row:`, body);
          exec({ t: m[1], action: 'insert', values: JSON.parse(body) });
          res.writeHead(201); return res.end();
        }
        const f = [];
        for (const [k, v] of u.searchParams) if (v.startsWith('eq.')) f.push(['eq', k, v.slice(3)]);
        return json(exec({ t: m[1], action: 'select', f, o: [['sort_order', true]] }));
      }
      return serveStatic();
    } catch (err) {
      console.error(err);
      return json({ data: null, error: { message: err.message } }, 500);
    }

    function serveStatic() {
      let p = path.join(ROOT, decodeURIComponent(u.pathname));
      if (p.endsWith(path.sep)) p = path.join(p, 'index.html');
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(404, 'text/plain', 'Not found');
      return send(200, TYPES[path.extname(p)] || 'application/octet-stream', fs.readFileSync(p));
    }
  });
}).listen(PORT, () => {
  const label = REAL ? 'Site (real database)' : 'Demo site';
  console.log(`${label}: http://localhost:${PORT}/`);
  console.log(`${label} admin: http://localhost:${PORT}/admin/`);
});
