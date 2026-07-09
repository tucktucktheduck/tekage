// api/midi.mjs — GET /api/midi?id=<sequenceId>
// Fetches an OnlineSequencer sequence and returns it as a real MIDI file,
// same-origin (OS sends no CORS headers, so the browser can't fetch it directly).
// Published sequences are effectively immutable, so we cache hard at the CDN.
import { fetchSequenceData, decodeData, buildMidi } from './_os.mjs';

export default async function handler(req, res) {
  const id = String((req.query && req.query.id) || '').trim();
  if (!/^\d{1,12}$/.test(id)) { res.status(400).json({ error: 'bad id' }); return; }
  try {
    const { data, title } = await fetchSequenceData(id);
    const decoded = decodeData(data);
    if (!decoded.notes.length) { res.status(404).json({ error: 'no notes in sequence' }); return; }
    const midi = buildMidi(decoded);
    res.setHeader('Content-Type', 'audio/midi');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, max-age=86400, immutable');
    res.setHeader('X-Sequence-Title', encodeURIComponent(title));
    res.status(200).send(midi);
  } catch (e) {
    res.status(502).json({ error: 'could not load sequence', detail: String(e.message || e) });
  }
}
