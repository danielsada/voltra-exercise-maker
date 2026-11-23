// Equipment profile → which exercises (and which of their setups) are possible.
// Pure functions: no DOM, no globals. `eq` is the equipment data from data/equipment.yaml.

export const ANCHORS = ['pullup', 'high', 'mid', 'low', 'platform'];
// Anchors that take a number of points (0, 1, or 2 = room for both Voltras side by side).
export const HEIGHTS = ['pullup', 'high', 'mid', 'low'];

// Attachment ids from earlier versions of the site → their current id.
const RENAMED = {
  'carbon-bar-premium-grip': 'single-bar',
  'alumacore-bar': 'single-bar',
  'fusioncore-bar': 'single-bar',
  'alumacore-fusioncore': 'single-bar',
};

export function defaultProfile() {
  return {
    units: 1,
    platform: false,
    attachments: { 'basic-handle': 1 },
    anchors: { pullup: 0, high: 0, mid: 1, low: 1 },
  };
}

const clampInt = (v, lo, hi, d) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

// Bring any (possibly stale or hand-edited) profile back to a valid shape.
export function normalizeProfile(p, eq) {
  const d = defaultProfile();
  const src = p && typeof p === 'object' ? p : {};
  const units = clampInt(src.units, 1, 2, d.units);
  const out = { units, platform: Boolean(src.platform), attachments: {}, anchors: {} };
  const raw = src.attachments && typeof src.attachments === 'object' ? src.attachments : d.attachments;
  const atts = {};
  for (const [id, q] of Object.entries(raw)) {
    const to = RENAMED[id] || id;
    atts[to] = Math.max(clampInt(atts[to], 0, 2, 0), clampInt(q, 0, 2, 0));
  }
  for (const a of eq.attachments) {
    const max = a.count === 'qty' ? 2 : 1;
    const q = clampInt(atts[a.id], 0, max, 0);
    if (q > 0) out.attachments[a.id] = q;
  }
  const anc = src.anchors && typeof src.anchors === 'object' ? src.anchors : d.anchors;
  // Earlier versions stored the pull-up bar as true/false, and true meant room for both Voltras.
  const pull = anc.pullup === true ? 2 : anc.pullup;
  for (const h of HEIGHTS) out.anchors[h] = Math.min(clampInt(h === 'pullup' ? pull : anc[h], 0, 2, 0), units);
  return out;
}

// How many usable items the profile owns for an attach token (an attachment id or a group id).
// A "pair" attachment (Ankle Straps) counts as 2.
export function ownedCount(profile, eq, token) {
  let n = 0;
  for (const a of eq.attachments) {
    if (a.id !== token && !(a.groups || []).includes(token)) continue;
    const q = profile.attachments[a.id] || 0;
    n += a.count === 'pair' ? q * 2 : q;
  }
  return n;
}

// Anchor points available at a given anchor. The Travel Platform holds one Voltra.
export function anchorPoints(profile, anchor) {
  if (anchor === 'platform') return profile.platform ? 1 : 0;
  return profile.anchors[anchor] || 0;
}

// Check one setup. Returns { ok, missing: [{ type, ... }] } so the UI can say what's missing.
export function checkSetup(setup, profile, eq) {
  const missing = [];
  const units = setup.units || 1;
  if (units > profile.units) missing.push({ type: 'units', need: units });
  const pts = anchorPoints(profile, setup.anchor);
  if (pts < units) missing.push({ type: 'anchor', anchor: setup.anchor, need: units, have: pts });
  const need = setup.need || 1;
  const attach = setup.attach || [];
  if (attach.length) {
    const have = attach.reduce((s, t) => s + ownedCount(profile, eq, t), 0);
    if (have < need) missing.push({ type: 'attach', attach, need, have });
  }
  return { ok: missing.length === 0, missing };
}

// The setup to show for an exercise: the first possible one that uses all your Voltras, else the
// first possible one. null when nothing fits.
export function bestSetup(ex, profile, eq) {
  let first = null;
  for (let i = 0; i < ex.setups.length; i++) {
    const s = ex.setups[i];
    if (!checkSetup(s, profile, eq).ok) continue;
    if ((s.units || 1) === profile.units) return i;
    if (first === null) first = i;
  }
  return first;
}

// For exercises you can't do: the setup that's closest (fewest missing things) and what it needs.
export function closestSetup(ex, profile, eq) {
  let best = null;
  ex.setups.forEach((s, i) => {
    const r = checkSetup(s, profile, eq);
    if (!best || r.missing.length < best.missing.length) best = { index: i, missing: r.missing };
  });
  return best;
}

export function availableExercises(exercises, profile, eq) {
  const out = new Map();
  for (const ex of exercises) {
    const i = bestSetup(ex, profile, eq);
    if (i !== null) out.set(ex.id, i);
  }
  return out;
}

const byId = (list, id) => list.find((x) => x.id === id);

export function anchorName(eq, id) {
  const a = byId(eq.anchors, id);
  return a ? a.name : id;
}

export function attachName(eq, token) {
  const a = byId(eq.attachments, token);
  if (a) return a.name;
  return (eq.groups && eq.groups[token]) || token;
}

// "Torso height · 2 Voltras · Basic Handle or Ring Handle ×2"
export function describeSetup(setup, eq) {
  const parts = [anchorName(eq, setup.anchor)];
  const units = setup.units || 1;
  parts.push(units === 2 ? '2 Voltras' : '1 Voltra');
  const attach = setup.attach || [];
  if (attach.length) {
    const names = attach.map((t) => attachName(eq, t)).join(' or ');
    parts.push((setup.need || 1) > 1 ? `${names} ×${setup.need}` : names);
  }
  return parts.join(' · ');
}

export function describeMissing(missing, eq) {
  return missing.map((m) => {
    if (m.type === 'units') return 'a second Voltra';
    if (m.type === 'anchor') {
      if (m.anchor === 'platform') return 'the Travel Platform';
      const a = byId(eq.anchors, m.anchor) || {};
      return m.need > 1 ? a.need2 || `two ${m.anchor} anchor points` : a.need || `a ${m.anchor} anchor`;
    }
    const names = m.attach.map((t) => attachName(eq, t)).join(' or ');
    return m.need > 1 ? `${m.need}× ${names}` : names;
  });
}
