// Workout composer: picks a balanced, seeded selection of possible exercises and orders it so
// exercises on the same anchor sit together (less re-rigging). Pure functions.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => Math.floor(Math.random() * 0xffffffff) >>> 0;

// Movement-pattern slots per focus, in priority order; the first `count` slots are used.
export const FOCUS = {
  full: ['squat', 'pull-horizontal', 'push-horizontal', 'hinge', 'pull-vertical', 'push-vertical', 'lunge', 'core', 'shoulders', 'rotation', 'biceps', 'triceps', 'glutes'],
  upper: ['pull-horizontal', 'push-horizontal', 'pull-vertical', 'push-vertical', 'shoulders', 'biceps', 'triceps', 'pull-horizontal', 'push-horizontal', 'core'],
  lower: ['squat', 'hinge', 'lunge', 'glutes', 'squat', 'hinge', 'lunge', 'core', 'glutes', 'rotation'],
  push: ['push-horizontal', 'push-vertical', 'triceps', 'shoulders', 'push-horizontal', 'push-vertical', 'triceps', 'core', 'shoulders', 'push-horizontal'],
  pull: ['pull-vertical', 'pull-horizontal', 'biceps', 'shoulders', 'pull-horizontal', 'pull-vertical', 'biceps', 'hinge', 'core', 'pull-horizontal'],
  arms: ['biceps', 'triceps', 'shoulders', 'biceps', 'triceps', 'shoulders', 'biceps', 'triceps', 'core', 'shoulders'],
  core: ['core', 'rotation', 'core', 'rotation', 'hinge', 'core', 'rotation', 'core', 'glutes', 'rotation'],
};

export const FOCUS_NAMES = {
  full: 'Full body', upper: 'Upper body', lower: 'Lower body', push: 'Push', pull: 'Pull', arms: 'Arms & shoulders', core: 'Core',
};

// When a slot's pattern has nothing left, try these instead.
export const RELATED = {
  squat: ['lunge', 'hinge', 'glutes'],
  hinge: ['glutes', 'squat', 'lunge'],
  lunge: ['squat', 'glutes', 'hinge'],
  glutes: ['hinge', 'lunge', 'squat', 'calves'],
  calves: ['glutes', 'squat'],
  'push-horizontal': ['push-vertical', 'triceps', 'shoulders'],
  'push-vertical': ['push-horizontal', 'shoulders', 'triceps'],
  'pull-horizontal': ['pull-vertical', 'shoulders', 'biceps'],
  'pull-vertical': ['pull-horizontal', 'biceps', 'shoulders'],
  shoulders: ['push-vertical', 'pull-horizontal'],
  biceps: ['pull-horizontal', 'pull-vertical'],
  triceps: ['push-horizontal', 'push-vertical'],
  core: ['rotation', 'hinge'],
  rotation: ['core'],
};

const FOCUS_REGIONS = {
  full: ['upper', 'lower', 'core'], upper: ['upper'], lower: ['lower'], push: ['upper'], pull: ['upper'], arms: ['upper'], core: ['core'],
};

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

// exercises: full list; available: Map(id → setup index). Returns [{ id, setup }].
export function compose(exercises, available, { focus = 'full', count = 6, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  const slots = (FOCUS[focus] || FOCUS.full).slice(0, count);
  const pool = exercises.filter((e) => available.has(e.id));
  const used = new Set();
  const out = [];
  const take = (pred) => {
    const cands = pool.filter((e) => !used.has(e.id) && pred(e));
    if (!cands.length) return false;
    const e = pick(cands, rng);
    used.add(e.id);
    out.push({ id: e.id, setup: available.get(e.id) });
    return true;
  };
  for (const slot of slots) {
    if (take((e) => e.pattern === slot)) continue;
    if ((RELATED[slot] || []).some((p) => take((e) => e.pattern === p))) continue;
    take((e) => (FOCUS_REGIONS[focus] || []).includes(e.region));
  }
  while (out.length < count && take(() => true));
  return orderByAnchor(out, exercises);
}

// Stable grouping by anchor, in order of first appearance.
export function orderByAnchor(items, exercises) {
  const anchorOf = (it) => {
    const ex = exercises.find((e) => e.id === it.id);
    const s = ex && ex.setups[it.setup];
    return s ? `${s.anchor}:${s.units || 1}` : '';
  };
  const order = [];
  for (const it of items) {
    const a = anchorOf(it);
    if (!order.includes(a)) order.push(a);
  }
  return order.flatMap((a) => items.filter((it) => anchorOf(it) === a));
}

// Replace items[index] with another possible exercise of the same (or a related) pattern.
export function swap(items, index, exercises, available, seed) {
  const rng = mulberry32(seed);
  const cur = exercises.find((e) => e.id === items[index].id);
  const used = new Set(items.map((i) => i.id));
  const pool = exercises.filter((e) => available.has(e.id) && !used.has(e.id));
  const tiers = cur ? [[cur.pattern], RELATED[cur.pattern] || [], null] : [null];
  for (const t of tiers) {
    const cands = pool.filter((e) => !t || t.includes(e.pattern));
    if (cands.length) {
      const e = pick(cands, rng);
      const next = items.slice();
      next[index] = { id: e.id, setup: available.get(e.id) };
      return next;
    }
  }
  return items;
}
