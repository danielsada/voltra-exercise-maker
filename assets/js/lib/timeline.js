// Timer configurations → a flat list of phases. Pure functions.
// Phase: { kind: 'prep'|'work'|'rest'|'setRest'|'done', seconds, label, round, rounds, set, sets, item, side }

export const TABATA_DEFAULTS = { prep: 10, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60 };
export const INTERVAL_DEFAULTS = { prep: 10, work: 40, rest: 20, rounds: 6, sets: 3, setRest: 90 };
export const WORKOUT_DEFAULTS = {
  prep: 15,
  tabata: { work: 20, rest: 10, rounds: 8 },
  interval: { work: 40, rest: 20, rounds: 3 },
  exRest: 60,
  circuits: 1,
  circuitRest: 120,
};

const LIMITS = {
  prep: [0, 600], work: [1, 3600], rest: [0, 3600], rounds: [1, 99], sets: [1, 50], setRest: [0, 3600],
  exRest: [0, 3600], circuits: [1, 20], circuitRest: [0, 3600],
};

export function clampConfig(cfg, defaults) {
  const out = { ...defaults };
  for (const k of Object.keys(defaults)) {
    if (typeof defaults[k] === 'object') continue;
    const [lo, hi] = LIMITS[k] || [0, 3600];
    const n = Math.round(Number(cfg && cfg[k]));
    out[k] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : defaults[k];
  }
  return out;
}

const done = () => ({ kind: 'done', seconds: 0, label: 'Done' });

export function buildInterval(cfg) {
  const c = clampConfig(cfg, INTERVAL_DEFAULTS);
  const phases = [];
  if (c.prep) phases.push({ kind: 'prep', seconds: c.prep, label: 'Get ready', round: 1, rounds: c.rounds, set: 1, sets: c.sets });
  for (let s = 1; s <= c.sets; s++) {
    for (let r = 1; r <= c.rounds; r++) {
      const at = { round: r, rounds: c.rounds, set: s, sets: c.sets };
      phases.push({ kind: 'work', seconds: c.work, label: 'Work', ...at });
      const lastRound = r === c.rounds;
      if (!lastRound && c.rest) phases.push({ kind: 'rest', seconds: c.rest, label: 'Rest', ...at });
      if (lastRound && s < c.sets && c.setRest) phases.push({ kind: 'setRest', seconds: c.setRest, label: 'Set rest', ...at });
    }
  }
  phases.push(done());
  return phases;
}

export const buildTabata = (cfg) => buildInterval(clampConfig(cfg, TABATA_DEFAULTS));

// items: [{ name, unilateral }] in order. format: 'tabata' | 'interval'.
export function buildWorkout(items, cfg = {}) {
  const format = cfg.format === 'interval' ? 'interval' : 'tabata';
  const block = clampConfig({ ...WORKOUT_DEFAULTS[format], ...(cfg[format] || {}) }, WORKOUT_DEFAULTS[format]);
  const c = clampConfig(cfg, { prep: WORKOUT_DEFAULTS.prep, exRest: WORKOUT_DEFAULTS.exRest, circuits: WORKOUT_DEFAULTS.circuits, circuitRest: WORKOUT_DEFAULTS.circuitRest });
  const phases = [];
  if (!items.length) return [done()];
  if (c.prep) phases.push({ kind: 'prep', seconds: c.prep, label: 'Get ready', item: 0, set: 1, sets: c.circuits });
  const sideCount = items.map(() => 0); // Tabata: sides keep alternating across circuits, so odd rounds even out
  for (let k = 1; k <= c.circuits; k++) {
    items.forEach((it, i) => {
      // One "work slot" per round; unilateral exercises: Tabata alternates sides, Interval does both sides each round.
      const slots = [];
      for (let r = 1; r <= block.rounds; r++) {
        if (it.unilateral && format === 'interval') {
          slots.push({ round: r, side: 'left' }, { round: r, side: 'right' });
        } else if (it.unilateral) {
          slots.push({ round: r, side: sideCount[i]++ % 2 ? 'right' : 'left' });
        } else {
          slots.push({ round: r });
        }
      }
      slots.forEach((sl, j) => {
        const at = { item: i, round: sl.round, rounds: block.rounds, set: k, sets: c.circuits };
        if (sl.side) at.side = sl.side;
        phases.push({ kind: 'work', seconds: block.work, label: it.name, ...at });
        // the rest before the next round shows the side that's coming up
        if (j < slots.length - 1 && block.rest) phases.push({ kind: 'rest', seconds: block.rest, label: 'Rest', ...at, ...(slots[j + 1].side ? { side: slots[j + 1].side } : {}) });
      });
      const lastItem = i === items.length - 1;
      if (!lastItem && c.exRest) {
        phases.push({ kind: 'setRest', seconds: c.exRest, label: 'Rest · set up next', item: i + 1, set: k, sets: c.circuits });
      } else if (lastItem && k < c.circuits && c.circuitRest) {
        phases.push({ kind: 'setRest', seconds: c.circuitRest, label: 'Circuit rest', item: 0, set: k + 1, sets: c.circuits });
      }
    });
  }
  phases.push(done());
  return phases;
}

export const totalSeconds = (phases) => phases.reduce((s, p) => s + p.seconds, 0);

export function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}
