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
  const anchors = { pullup: false, high: 0, mid: 0, low: 0 };
  for (const [id, n] of pairs(q.get('k'))) anchors[id] = id === 'pullup' ? n > 0 : n;
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

export function decodeWorkout(str, exercises) {
  const q = new URLSearchParams(str.replace(/^#/, ''));
  if (!q.get('w')) return null;
  const items = [];
  for (const [id, n] of pairs(q.get('w'))) {
    const ex = exercises.find((e) => e.id === id);
    if (!ex) continue;
    const setup = Number.isInteger(n) && n >= 0 && n < ex.setups.length ? n : 0;
    items.push({ id, setup });
  }
  return items.length ? { items, format: q.get('f') === 'interval' ? 'interval' : 'tabata' } : null;
}
