// Stick-figure engine: renders an exercise as an SVG string (no DOM needed, so it's unit-testable).
// Poses are joint angles; positions come from forward kinematics. Animation = SMIL <animate> on the
// path data, sampled from eased pose interpolation. SMIL isn't a CSS transition, so it always plays.
//
// Angle conventions (degrees). Side view faces right (+x = forward):
//   torso     lean of the torso from vertical; + forward (hinge), - back. Lying on the back = -90.
//   shoulder  upper arm relative to the torso: 0 along the torso (hanging), 90 straight out in front, 180 overhead.
//   elbow     flexion: 0 straight, + folds the forearm toward the front of the upper arm.
//   thigh     thigh from straight down; + knee forward (90 = horizontal in front).
//   knee      flexion: + folds the shin back.  leg 1 = stance/root leg, leg 2 = other leg (`thigh2`, `knee2`).
//   shoulder2/elbow2 = the far arm (defaults to the near arm).
//   rise      lifts the heels (px; calf raises).  shrug  lifts the shoulders (px; also in front view).
//   Lying on the back: torso -90 (head to the left); face down: torso 90 (head to the right).
// Front view (+x = image right):
//   lean (side bend, + right), stance (legs apart), squat (hip flexion, shortens the legs),
//   abduct/elbow (both arms, mirrored) or abductL/elbowL/abductR/elbowR, leg2 (right leg out to the side),
//   reach + ext: both hands together at angle `reach` from straight down (+ toward image right), ext = 0..1 of arm length.

import { ownedCount } from './equipment.js';

export const L = { torso: 46, neck: 6, head: 9, upper: 26, fore: 24, thigh: 38, shin: 38, foot: 11, hipW: 8, shW: 12 };
export const GROUND = 186;
const SIZE = 200;
const LIFT = { platform: 5 };

const rad = (d) => (d * Math.PI) / 180;
const down = (a, l) => [Math.sin(rad(a)) * l, Math.cos(rad(a)) * l];
const up = (a, l) => [Math.sin(rad(a)) * l, -Math.cos(rad(a)) * l];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
const sub = (p, v) => [p[0] - v[0], p[1] - v[1]];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const r1 = (n) => Math.round(n * 10) / 10;
const pt = (p) => `${r1(p[0])} ${r1(p[1])}`;

const SIDE = { torso: 0, head: 0, shoulder: 0, elbow: 8, shoulder2: null, elbow2: null, thigh: 0, knee: 0, thigh2: null, knee2: null, rise: 0, shrug: 0 };
const FRONT = { lean: 0, stance: 8, squat: 0, shrug: 0, leg2: null, abduct: 10, elbow: 6, flex: 0, abductL: null, elbowL: null, flexL: null, abductR: null, elbowR: null, flexR: null, reach: null, ext: 0.8 };

function fill(p, view) {
  const q = { ...(view === 'front' ? FRONT : SIDE), ...p };
  if (view === 'front') {
    q.abductL ??= q.abduct; q.abductR ??= q.abduct; q.elbowL ??= q.elbow; q.elbowR ??= q.elbow; q.flexL ??= q.flex; q.flexR ??= q.flex;
  } else {
    q.shoulder2 ??= q.shoulder; q.elbow2 ??= q.elbow; q.thigh2 ??= q.thigh; q.knee2 ??= q.knee;
  }
  return q;
}

function footFor(ankle, shinAngle, ground, flat) {
  if (flat) {
    // flat foot; on the toes when the ankle is lifted (calf raises)
    const dy = Math.max(0, ground - 3 - ankle[1]);
    return add(ankle, [Math.sqrt(Math.max(0, L.foot * L.foot - dy * dy)), dy]);
  }
  const t = add(ankle, down(shinAngle + 90, L.foot));
  return [t[0], Math.min(t[1], ground)];
}

export function sideJoints(p, base, x0, ground) {
  const j = {};
  const leg = (hip, th, kn) => {
    const knee = add(hip, down(th, L.thigh));
    return { knee, ankle: add(knee, down(th - kn, L.shin)) };
  };
  if (base === 'kneel' || base === 'halfkneel') {
    const k = base === 'kneel' ? p.thigh : p.thigh2;
    const knee = [x0, ground - 4];
    j.hip = sub(knee, down(k, L.thigh));
    const kneeling = { knee, ankle: add(knee, [-L.shin, 0]) };
    if (base === 'kneel') {
      j.leg1 = kneeling; j.leg2 = kneeling;
    } else {
      j.leg2 = kneeling; j.leg1 = leg(j.hip, p.thigh, p.knee);
    }
  } else if (base === 'seat' || base === 'lie') {
    j.hip = [x0, ground - 7];
    j.leg1 = leg(j.hip, p.thigh, p.knee);
    j.leg2 = leg(j.hip, p.thigh2, p.knee2);
  } else {
    // stand / split: the near (stance) foot is planted
    const ankle = [x0, ground - 3 - p.rise];
    const knee = sub(ankle, down(p.thigh - p.knee, L.shin));
    j.hip = sub(knee, down(p.thigh, L.thigh));
    j.leg1 = { knee, ankle };
    j.leg2 = leg(j.hip, p.thigh2, p.knee2);
  }
  const flat1 = !['seat', 'lie', 'kneel'].includes(base);
  j.leg1.toe = footFor(j.leg1.ankle, p.thigh - p.knee, ground, flat1);
  j.leg2.toe = base === 'kneel' || base === 'halfkneel'
    ? add(j.leg2.ankle, [-2, 3])
    : footFor(j.leg2.ankle, p.thigh2 - p.knee2, ground, base === 'stand' && p.thigh2 === p.thigh && p.knee2 === p.knee);
  if (base === 'kneel') j.leg1.toe = j.leg2.toe;
  j.shoulder = add(j.hip, up(p.torso, L.torso + p.shrug));
  j.neck = add(j.shoulder, up(p.torso + p.head, L.neck));
  j.headC = add(j.shoulder, up(p.torso + p.head, L.neck + L.head));
  const arm = (sh, el) => {
    const ua = -p.torso + sh;
    const elbow = add(j.shoulder, down(ua, L.upper));
    return { elbow, hand: add(elbow, down(ua + el, L.fore)) };
  };
  j.arm1 = arm(p.shoulder, p.elbow);
  j.arm2 = arm(p.shoulder2, p.elbow2);
  return j;
}

// Two-bone IK: elbow bends away from `outSign` side (−1 left, +1 right).
function ik(s, t, outSign) {
  const l1 = L.upper;
  const l2 = L.fore;
  let dx = t[0] - s[0];
  let dy = t[1] - s[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const dmax = l1 + l2 - 0.01;
  const dmin = Math.abs(l1 - l2) + 0.01;
  const dc = Math.min(dmax, Math.max(dmin, d));
  dx = (dx / d) * dc; dy = (dy / d) * dc; d = dc;
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const base = Math.atan2(dy, dx);
  const e1 = [s[0] + Math.cos(base + a) * l1, s[1] + Math.sin(base + a) * l1];
  const e2 = [s[0] + Math.cos(base - a) * l1, s[1] + Math.sin(base - a) * l1];
  const elbow = (e1[0] - e2[0]) * outSign >= 0 ? e1 : e2;
  return { elbow, hand: [s[0] + dx, s[1] + dy] };
}

export function frontJoints(p, x0, ground, base) {
  const j = {};
  if (base === 'kneel' || base === 'halfkneel') {
    const hc = [x0, ground - 4 - L.thigh];
    j.hc = hc;
    j.hipL = sub(hc, [L.hipW, 0]);
    j.hipR = add(hc, [L.hipW, 0]);
    j.kneeL = [j.hipL[0] - 2, ground - 4];
    j.kneeR = [j.hipR[0] + 2, ground - 4];
    j.ankleL = add(j.kneeL, [-1, 2]);
    j.ankleR = add(j.kneeR, [1, 2]);
    j.toeL = add(j.ankleL, [-4, 1]);
    j.toeR = add(j.ankleR, [4, 1]);
    if (base === 'halfkneel') {
      // right foot forward: the thigh points at the viewer (short), the shin stands on the floor
      j.kneeR = add(j.hipR, [3, 8]);
      j.ankleR = [j.kneeR[0] + 1, ground - 3];
      j.toeR = add(j.ankleR, [6, 0]);
    }
    return upperFront(j, p);
  }
  const lt = L.thigh * Math.max(0.35, Math.cos(rad(p.squat)));
  const ta = p.stance + p.squat * 0.35;
  const sa = p.stance - p.squat * 0.1;
  const thighL = [-Math.sin(rad(ta)) * lt, Math.cos(rad(ta)) * lt];
  const shinL = [-Math.sin(rad(sa)) * L.shin, Math.cos(rad(sa)) * L.shin];
  const hc = [x0, ground - 3 - thighL[1] - shinL[1]];
  j.hc = hc;
  j.hipL = sub(hc, [L.hipW, 0]);
  j.hipR = add(hc, [L.hipW, 0]);
  j.kneeL = add(j.hipL, thighL);
  j.ankleL = add(j.kneeL, shinL);
  if (p.leg2 !== null && p.leg2 !== undefined) {
    j.kneeR = add(j.hipR, [Math.sin(rad(p.leg2)) * L.thigh, Math.cos(rad(p.leg2)) * L.thigh]);
    j.ankleR = add(j.kneeR, [Math.sin(rad(p.leg2)) * L.shin, Math.cos(rad(p.leg2)) * L.shin]);
  } else {
    j.kneeR = add(j.hipR, [-thighL[0], thighL[1]]);
    j.ankleR = add(j.kneeR, [-shinL[0], shinL[1]]);
  }
  j.toeL = add(j.ankleL, [-6, 0]);
  j.toeR = add(j.ankleR, [6, 0]);
  return upperFront(j, p);
}

function upperFront(j, p) {
  j.sc = add(j.hc, up(p.lean, L.torso + p.shrug));
  const perp = [Math.cos(rad(p.lean)), Math.sin(rad(p.lean))];
  j.shL = sub(j.sc, [perp[0] * L.shW, perp[1] * L.shW]);
  j.shR = add(j.sc, [perp[0] * L.shW, perp[1] * L.shW]);
  j.neck = add(j.sc, up(p.lean, L.neck));
  j.headC = add(j.sc, up(p.lean, L.neck + L.head));
  if (p.reach !== null && p.reach !== undefined) {
    const t = add(j.sc, down(p.reach, (L.upper + L.fore) * p.ext));
    j.armL = ik(j.shL, t, -1);
    j.armR = ik(j.shR, t, 1);
    j.target = t;
  } else {
    // flex = how far the arm points toward the viewer (0 = in the frontal plane, 90 = straight at you).
    const arm = (sh, s, a, e, fl) => {
      const c = Math.cos(rad(fl || 0));
      const elbow = add(sh, [s * Math.sin(rad(a)) * L.upper * c, Math.cos(rad(a)) * L.upper * c]);
      return { elbow, hand: add(elbow, [s * Math.sin(rad(a + e)) * L.fore * c, Math.cos(rad(a + e)) * L.fore * c]) };
    };
    j.armL = arm(j.shL, -1, p.abductL, p.elbowL, p.flexL);
    j.armR = arm(j.shR, 1, p.abductR, p.elbowR, p.flexR);
  }
  return j;
}

// ---------- pose sequence ----------
const smooth = (t) => t * t * (3 - 2 * t);

export function poseAt(seq, t) {
  const n = seq.length;
  if (n === 1) return seq[0];
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  for (let i = n - 2; i > 0; i--) order.push(i);
  const segs = order.length;
  const x = (((t % 1) + 1) % 1) * segs;
  const i = Math.floor(x);
  const f = smooth(x - i);
  const a = seq[order[i]];
  const b = seq[order[(i + 1) % segs]];
  const out = {};
  for (const k of Object.keys(a)) {
    const va = a[k];
    const vb = b[k];
    out[k] = typeof va === 'number' && typeof vb === 'number' ? va + (vb - va) * f : va;
  }
  return out;
}

export function poseSequence(fig) {
  const view = fig.view || 'side';
  const base = fig.pose || {};
  const poses = fig.poses && fig.poses.length ? fig.poses : [{}];
  return poses.map((p) => fill({ ...base, ...p }, view));
}

// ---------- rig ----------
const HEIGHT_Y = { high: 28, mid: 98, low: GROUND - 14 };

// Where each Voltra sits and where its cable leaves it.
export function rig(fig, anchor, units, view) {
  const x0 = view === 'front' ? 100 : (fig.x ?? 92);
  const ground = GROUND - (LIFT[anchor] || 0);
  const out = { x0, ground, units: [] };
  if (anchor === 'pullup') {
    const xs = view === 'front' ? (units === 2 ? [x0 - 24, x0 + 24] : [x0]) : [x0 + (fig.dx ?? 14)];
    out.units = xs.map((x) => ({ box: [x - 6, 15, 12, 17], exit: [x, 33] }));
    out.bar = [[view === 'front' ? 30 : x0 - 50, 12], [view === 'front' ? 170 : x0 + 70, 12]];
  } else if (anchor === 'platform') {
    const ux = view === 'front' ? x0 : x0 + 6;
    out.platform = view === 'front' ? [x0 - 42, ground, 84, 5] : [x0 - 34, ground, 76, 5];
    out.units = [{ box: [ux - 7, ground - 9, 14, 9], exit: [ux, ground - 9] }];
  } else {
    const y = HEIGHT_Y[anchor];
    const dist = fig.dist ?? 72;
    let sides;
    if (view === 'front' && units === 1 && !fig.from) {
      // anchored straight in front of the person
      const yy = anchor === 'low' ? ground - 9 : y - 8;
      out.units = [{ box: [x0 - 6, yy, 12, anchor === 'low' ? 9 : 16], exit: [x0, anchor === 'low' ? ground - 9 : y] }];
      return out;
    }
    if (view === 'front') sides = units === 2 ? [-1, 1] : [fig.from === 'L' ? -1 : 1];
    else sides = [fig.from === 'back' ? -1 : 1];
    out.units = sides.map((s) => {
      const x = x0 + s * (view === 'front' ? 78 : dist);
      return { box: [x - 6, y - 8, 12, 16], exit: [x - s * 6, y], post: [x + s * 9, Math.max(6, y - 22), anchor === 'low' ? ground : y + 22], side: s };
    });
  }
  return out;
}

// ---------- gear ----------
export const GEAR = {
  'basic-handle': 'handle', 'ring-handle': 'ring', 'ankle-strap': 'strap', 'functional-rope': 'rope', 'squat-harness': 'harness',
  handle: 'handle', bar1: 'bar', bar2: 'bar',
};

// Draw the attachment you'd actually use: the first alternative you own (with a profile), else the first listed.
export function gearFor(setup, eq, profile) {
  const list = (setup && setup.attach) || [];
  const owned = profile && eq ? list.find((t) => ownedCount(profile, eq, t) > 0) : null;
  const tok = owned || list[0] || '';
  if (GEAR[tok]) return GEAR[tok];
  const a = eq && eq.attachments.find((x) => x.id === tok);
  return (a && a.gear) || 'handle';
}

function frame(fig, pose, ctx) {
  const { view, base, r, gear, units } = ctx;
  const f = {};
  let ends; // cable endpoints, one per unit
  if (view === 'front') {
    const j = frontJoints(pose, r.x0, r.ground, base);
    f.body = `M${pt(j.toeL)}L${pt(j.ankleL)}L${pt(j.kneeL)}L${pt(j.hipL)}L${pt(j.hipR)}L${pt(j.kneeR)}L${pt(j.ankleR)}L${pt(j.toeR)}`
      + `M${pt(j.hc)}L${pt(j.sc)}L${pt(j.neck)}M${pt(j.armL.hand)}L${pt(j.armL.elbow)}L${pt(j.shL)}L${pt(j.shR)}L${pt(j.armR.elbow)}L${pt(j.armR.hand)}`;
    f.far = '';
    f.head = j.headC;
    const handL = j.armL.hand;
    const handR = j.armR.hand;
    if (fig.attach === 'ankle') ends = [j.ankleR];
    else if (fig.attach === 'harness') ends = [add(j.hc, [0, 4])];
    else if (fig.attach === 'chest') ends = [add(j.sc, [0, 6])];
    else if (units === 2) ends = r.units.length === 2 ? [handL, handR] : [mid(handL, handR)];
    else if (fig.hand === 'L') ends = [handL];
    else if (fig.hand === 'R') ends = [handR];
    else ends = [mid(handL, handR)];
    if (fig.cross && ends.length === 2) ends.reverse();
    if (gear === 'bar') {
      // a two-Voltra bar spans the hands; when the hands meet (close-grip moves) draw a short bar instead
      const span = units === 2 && r.units.length === 2 && Math.hypot(handR[0] - handL[0], handR[1] - handL[1]) >= 8;
      const a = span ? handL : sub(mid(handL, handR), [16, 0]);
      const b = span ? handR : add(mid(handL, handR), [16, 0]);
      if (units === 2 && r.units.length === 2 && !span) ends = [a, b];
      const v = sub(b, a);
      const n = Math.hypot(v[0], v[1]) || 1;
      const ext = [(v[0] / n) * 9, (v[1] / n) * 9];
      f.gear = `M${pt(sub(a, ext))}L${pt(add(b, ext))}`;
    } else if (gear === 'harness') {
      f.gear = `M${pt(j.shL)}L${pt(add(j.hc, [0, 4]))}L${pt(j.shR)}`;
    } else if (gear === 'strap') {
      f.gear = loop(j.ankleR, 3.2);
    } else {
      f.gear = ends.map((e) => handleAt(e, gear)).join('');
    }
  } else {
    const j = sideJoints(pose, base, r.x0, r.ground);
    const leg = (g) => `M${pt(g.toe)}L${pt(g.ankle)}L${pt(g.knee)}L${pt(j.hip)}`;
    f.far = `${leg(j.leg2)}M${pt(j.shoulder)}L${pt(j.arm2.elbow)}L${pt(j.arm2.hand)}`;
    f.body = `${leg(j.leg1)}L${pt(j.shoulder)}L${pt(j.neck)}M${pt(j.shoulder)}L${pt(j.arm1.elbow)}L${pt(j.arm1.hand)}`;
    f.head = j.headC;
    const harnessPt = add(j.hip, up(pose.torso, 10));
    const strapLeg = fig.leg === 1 ? j.leg1 : j.leg2;
    if (fig.attach === 'ankle') ends = [strapLeg.ankle];
    else if (fig.attach === 'chest') ends = [add(j.shoulder, up(pose.torso + 90, 4))];
    else if (fig.attach === 'harness') ends = [add(harnessPt, up(pose.torso + 90, 6))];
    else ends = [j.arm1.hand];
    if (gear === 'bar') f.gear = loop(j.arm1.hand, 2.6);
    else if (gear === 'harness') f.gear = `M${pt(add(j.shoulder, up(pose.torso + 90, 3)))}L${pt(ends[0])}L${pt(harnessPt)}`;
    else if (gear === 'strap') f.gear = loop(strapLeg.ankle, 3.2);
    else f.gear = handleAt(j.arm1.hand, gear);
  }
  f.cables = r.units.map((u, i) => {
    const e = ends[Math.min(i, ends.length - 1)];
    return `M${pt(u.exit)}L${pt(e)}`;
  });
  return f;
}

function loop(c, rr) {
  return `M${pt([c[0] - rr, c[1]])}A${rr} ${rr} 0 1 0 ${pt([c[0] + rr, c[1]])}A${rr} ${rr} 0 1 0 ${pt([c[0] - rr, c[1]])}`;
}

function handleAt(h, gear) {
  if (gear === 'rope') return `M${pt(add(h, [-3, -5]))}L${pt(add(h, [0, 0]))}L${pt(add(h, [3, -5]))}`;
  if (gear === 'ring') return loop(h, 3.4);
  return `M${pt(add(h, [0, -4]))}L${pt(add(h, [0, 4]))}`;
}

function anim(attr, values, dur, keyTimes) {
  if (values.every((v) => v === values[0])) return '';
  return `<animate attributeName="${attr}" dur="${dur}s" repeatCount="indefinite" calcMode="linear" keyTimes="${keyTimes}" values="${values.join(';')}"/>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// A setup can tweak the figure for its rig (setup.fig), e.g. where the anchor sits or how the arms hold.
export function figureFor(figure = {}, setup = {}) {
  const o = setup.fig || {};
  return { attach: 'hands', ...figure, ...o, pose: { ...(figure.pose || {}), ...(o.pose || {}) } };
}

// opts: { figure, setup, gear, animate = true, title, className }
export function renderFigure({ figure = {}, setup = { anchor: 'mid', units: 1 }, gear, animate = true, title = '', className = 'fig' } = {}) {
  const units = setup.units || 1;
  const fig = figureFor(figure, setup);
  const view = fig.view || 'side';
  const ctx = { view, base: fig.base || 'stand', units, gear: gear || 'handle', r: rig(fig, setup.anchor, units, view) };
  const seq = poseSequence(fig);
  const tempo = Number(fig.tempo) || 3;
  const n = animate && seq.length > 1 ? Math.min(48, 12 * 2 * (seq.length - 1)) : 0;
  const frames = [];
  for (let i = 0; i <= n; i++) frames.push(frame(fig, poseAt(seq, n ? i / n : 0), ctx));
  const f0 = frames[0];
  const keyTimes = n ? frames.map((_, i) => (i / n).toFixed(4)).join(';') : '';
  const A = (attr, get) => (n ? anim(attr, frames.map(get), tempo, keyTimes) : '');
  const { r } = ctx;
  const env = [];
  env.push(`<path class="fig__ground" d="M4 ${GROUND}H196"/>`);
  if (r.bar) env.push(`<path class="fig__bar" d="M${pt(r.bar[0])}H${r1(r.bar[1][0])}M${r1(r.bar[0][0])} 4V${r.bar[0][1]}M${r1(r.bar[1][0])} 4V${r.bar[1][1]}"/>`);
  if (r.platform) env.push(`<rect class="fig__platform" x="${r1(r.platform[0])}" y="${r1(r.platform[1])}" width="${r.platform[2]}" height="${r.platform[3]}" rx="1.5"/>`);
  for (const u of r.units) if (u.post) env.push(`<path class="fig__post" d="M${r1(u.post[0])} ${r1(u.post[1])}V${r1(u.post[2])}"/>`);
  const units2side = units === 2 && r.units.length === 1;
  const unitsSvg = r.units.map((u) => `<rect class="fig__unit" x="${r1(u.box[0])}" y="${r1(u.box[1])}" width="${u.box[2]}" height="${u.box[3]}" rx="2.5"/>`);
  if (units2side) {
    const u = r.units[0];
    unitsSvg.unshift(`<rect class="fig__unit fig__unit--far" x="${r1(u.box[0] + 3)}" y="${r1(u.box[1] - 3)}" width="${u.box[2]}" height="${u.box[3]}" rx="2.5"/>`);
  }
  const cables = f0.cables.map((d, ci) => `<path class="fig__cable" d="${d}">${A('d', (fr) => fr.cables[ci])}</path>`);
  if (units2side) cables.unshift(`<path class="fig__cable fig__cable--far" d="${f0.cables[0]}" transform="translate(3 -3)">${A('d', (fr) => fr.cables[0])}</path>`);
  const label = title ? `<title>${esc(title)}</title>` : '';
  return `<svg class="${className}" viewBox="0 0 ${SIZE} ${SIZE}" role="img"${title ? '' : ' aria-hidden="true"'}>${label}`
    + `<g class="fig__env">${env.join('')}</g>`
    + (f0.far ? `<path class="fig__far" d="${f0.far}">${A('d', (fr) => fr.far)}</path>` : '')
    + cables.join('')
    + `<g class="fig__units">${unitsSvg.join('')}</g>`
    + `<path class="fig__body" d="${f0.body}">${A('d', (fr) => fr.body)}</path>`
    + `<circle class="fig__head" cx="${r1(f0.head[0])}" cy="${r1(f0.head[1])}" r="${L.head}">${A('cx', (fr) => r1(fr.head[0]))}${A('cy', (fr) => r1(fr.head[1]))}</circle>`
    + `<path class="fig__gear" d="${f0.gear}">${A('d', (fr) => fr.gear)}</path>`
    + '</svg>';
}
