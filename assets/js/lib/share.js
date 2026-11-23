// URL-hash encoding for equipment profiles and composed workouts, so both can be shared as links
// and need no server. Pure functions over strings.

// Profile → "u=2&tp=1&a=basic-handle.2,functional-rope.1&k=pullup.2,mid.2"
export function encodeProfile(p) {
  const q = new URLSearchParams();
  q.set('u', String(p.units));
  if (p.platform) q.set('tp', '1');
  const a = Object.entries(p.attachments).filter(([, n]) => n > 0).map(([id, n]) => `${id}.${n}`);
  if (a.length) q.set('a', a.join(','));
  const k = Object.entries(p.anchors).filter(([, n]) => n).map(([id, n]) => `${id}.${Number(n)}`);
  if (k.length) q.set('k', k.join(','));
  return q.toString();
}

const pairs = (s) => (s ? s.split(',') : []).map((x) => {
  const i = x.lastIndexOf('.');
  return i > 0 ? [x.slice(0, i), Number(x.slice(i + 1))] : [x, 1];
});

// Returns a raw profile; pass it through normalizeProfile() before use.
export function decodeProfile(str) {
  const q = new URLSearchParams(str.replace(/^#/, ''));
  if (!q.has('u')) return null;
  const anchors = { pullup: 0, high: 0, mid: 0, low: 0 };
  for (const [id, n] of pairs(q.get('k'))) if (id in anchors) anchors[id] = n;
  return {
    units: Number(q.get('u')),
    platform: q.get('tp') === '1',
    attachments: Object.fromEntries(pairs(q.get('a'))),
    anchors,
  };
}

// Workout → "w=kneeling-lat-pulldown.0,goblet-squat.1&f=tabata"
export function encodeWorkout(items, format) {
  const q = new URLSearchParams();
  q.set('w', items.map((i) => `${i.id}.${i.setup}`).join(','));
  q.set('f', format === 'interval' ? 'interval' : 'tabata');
  return q.toString();
}

// null when the hash has no workout; { items: [] } when it has one but none of its exercises are known.
export function decodeWorkout(str, exercises) {
  const q = new URLSearchParams(str.replace(/^#/, ''));
  if (!q.has('w')) return null;
  const items = normalizeItems(pairs(q.get('w')).map(([id, setup]) => ({ id, setup })), exercises);
  return { items, format: q.get('f') === 'interval' ? 'interval' : 'tabata' };
}

// Keep only well-formed items for known exercises (saved data may be stale or hand-edited).
export function normalizeItems(items, exercises) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    const ex = it && typeof it.id === 'string' ? exercises.find((e) => e.id === it.id) : null;
    if (!ex || out.some((o) => o.id === ex.id)) continue;
    const n = Number(it.setup);
    out.push({ id: ex.id, setup: Number.isInteger(n) && n >= 0 && n < ex.setups.length ? n : 0 });
  }
  return out;
}

export const normalizeFormat = (f) => (f === 'interval' ? 'interval' : 'tabata');
