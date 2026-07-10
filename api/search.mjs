// api/search.mjs — GET /api/search?q=<query>
// Scrapes OnlineSequencer's own browse search (/sequences?search=…) and returns
// lightweight results. Each result's `midi` points at our same-origin proxy, so
// the library page and game can pull the chart without hitting OS cross-origin.
import { osFetch, decodeEntities } from './_os.mjs';

export default async function handler(req, res) {
  const q = String((req.query && req.query.q) || '').trim().slice(0, 120);
  res.setHeader('Cache-Control', 'public, s-maxage=1800, max-age=300');
  if (!q) { res.status(200).json({ results: [] }); return; }
  try {
    const url = `https://onlinesequencer.net/sequences?search=${encodeURIComponent(q)}&sort=1`;
    const r = await osFetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const results = [];
    const seen = new Set();
    // each card: <div class="preview" title="TITLE"> … <div class="info">N notes</div> … <a href="/ID">
    const re = /<div class="preview" title="([^"]*)">([\s\S]*?)<a href="\/(\d+)"/g;
    let m;
    while ((m = re.exec(html)) && results.length < 40) {
      const id = m[3];
      if (seen.has(id)) continue; seen.add(id);
      const title = decodeEntities(m[1]).trim() || `Sequence ${id}`;
      const info = (m[2].match(/<div class="info">([^<]*)<\/div>/) || [])[1] || '';
      const notes = parseInt(String(info).replace(/[^\d]/g, ''), 10) || 0;
      results.push({ id, title, notes, midi: `/api/midi?id=${id}`, url: `https://onlinesequencer.net/${id}` });
    }
    res.status(200).json({ query: q, results });
  } catch (e) {
    res.status(502).json({ error: 'search failed', detail: String(e.message || e), results: [] });
  }
}
