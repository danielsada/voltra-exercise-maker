// Browser helpers shared by the page scripts: storage, figure mounting, the demo figure for each anchor.
import { renderFigure, gearFor } from './figure.js';

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(`voltra:${key}`);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`voltra:${key}`, JSON.stringify(value));
    } catch {
      /* private mode: settings just won't persist */
    }
  },
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function figureSVG(ex, setupIndex, eq, opts = {}) {
  const setup = ex.setups[setupIndex] || ex.setups[0];
  return renderFigure({ figure: ex.figure, setup, gear: gearFor(setup, eq, opts.profile), title: opts.title || '', animate: opts.animate !== false });
}

// SMIL keeps running off-screen; pause figures that aren't visible.
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      const svg = e.target.querySelector('svg');
      if (!svg || !svg.pauseAnimations) continue;
      if (e.isIntersecting) svg.unpauseAnimations();
      else svg.pauseAnimations();
    }
  }, { rootMargin: '100px' })
  : null;

export function mountFigure(el, svg) {
  if (el.dataset.svg === svg) return;
  el.dataset.svg = svg;
  el.innerHTML = svg;
  if (io) {
    io.unobserve(el);
    io.observe(el);
  }
}

// The exercise that best shows each anchor (diagrams on the Equipment page and the composer form).
const DEMO = {
  'pullup:1': 'lat-pulldown', 'pullup:2': 'lat-pulldown', 'high:1': 'triceps-pushdown', 'high:2': 'high-to-low-fly',
  'mid:1': 'standing-row', 'mid:2': 'chest-fly', 'low:1': 'biceps-curl', 'low:2': 'low-to-high-fly', 'platform:1': 'deadlift',
};

export function anchorDemo(anchor, units, exercises, eq) {
  const ex = exercises.find((e) => e.id === DEMO[`${anchor}:${units}`]);
  if (!ex) return '';
  const i = ex.setups.findIndex((s) => s.anchor === anchor && (s.units || 1) === units);
  return i < 0 ? '' : figureSVG(ex, i, eq);
}

// "each side" depends on the setup too (e.g. a one-arm raise becomes both arms with two Voltras).
export function showEachSide(li, ex, setup) {
  const tag = li.querySelector('.ex__each');
  if (tag) tag.hidden = !unilateralOf(ex, setup);
}

export function unilateralOf(ex, setup) {
  return setup && typeof setup.unilateral === 'boolean' ? setup.unilateral : Boolean(ex.unilateral);
}

export function copyText(text, button) {
  const done = (ok) => {
    if (!button) return;
    const old = button.dataset.label || button.textContent;
    button.dataset.label = old;
    button.lastChild.textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => { button.lastChild.textContent = old.trim(); }, 1600);
  };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
  else done(false);
}
