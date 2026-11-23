// Composer page: equipment form ↔ profile, library filtering, figures, workout composing.
import * as P from '@params';
import { normalizeProfile, defaultProfile, availableExercises, closestSetup, describeMissing, describeSetup, HEIGHTS } from './lib/equipment.js';
import { compose, swap, newSeed } from './lib/compose.js';
import { buildWorkout, totalSeconds } from './lib/timeline.js';
import { encodeProfile, decodeProfile, encodeWorkout } from './lib/share.js';
import { store, $, $$, figureSVG, mountFigure, anchorDemo, unilateralOf, copyText } from './lib/ui.js';

const eq = P.equipment;
const exercises = P.exercises;
const exById = new Map(exercises.map((e) => [e.id, e]));
const form = $('#eqform');

// ---------- profile ----------
let profile = normalizeProfile(decodeProfile(location.hash) || store.get('profile') || defaultProfile(), eq);
let available = new Map();

function writeForm() {
  form.elements.units.value = String(profile.units);
  form.elements.platform.checked = profile.platform;
  form.elements['anchor-pullup'].checked = profile.anchors.pullup;
  for (const h of HEIGHTS) {
    form.elements[`anchor-${h}`].checked = profile.anchors[h] > 0;
    form.elements[`two-${h}`].checked = profile.anchors[h] > 1;
  }
  for (const a of eq.attachments) {
    const el = form.elements[`att-${a.id}`];
    const q = profile.attachments[a.id] || 0;
    if (el.type === 'checkbox') el.checked = q > 0;
    else el.value = String(q);
  }
}

function readForm() {
  const units = Number(form.elements.units.value) || 1;
  const p = { units, platform: form.elements.platform.checked, attachments: {}, anchors: { pullup: form.elements['anchor-pullup'].checked } };
  for (const h of HEIGHTS) {
    const on = form.elements[`anchor-${h}`].checked;
    p.anchors[h] = on ? (units === 2 && form.elements[`two-${h}`].checked ? 2 : 1) : 0;
  }
  for (const a of eq.attachments) {
    const el = form.elements[`att-${a.id}`];
    p.attachments[a.id] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : Number(el.value);
  }
  return normalizeProfile(p, eq);
}

function syncFormState() {
  const two = profile.units === 2;
  form.classList.toggle('is-two', two);
  for (const h of HEIGHTS) {
    form.elements[`two-${h}`].disabled = !two || !form.elements[`anchor-${h}`].checked;
  }
  $$('.anc').forEach((li) => {
    const a = li.dataset.anchor;
    const units = two && (a === 'pullup' || profile.anchors[a] > 1) ? 2 : 1;
    mountFigure($('.anc__fig', li), anchorDemo(a, units, exercises, eq));
    li.classList.toggle('is-on', a === 'pullup' ? profile.anchors.pullup : profile.anchors[a] > 0);
  });
}

function onProfile() {
  store.set('profile', profile);
  if (location.hash.includes('u=')) history.replaceState(null, '', location.pathname + location.search);
  available = availableExercises(exercises, profile, eq);
  syncFormState();
  renderLibrary();
  refreshWorkout();
  $('#eqsum').textContent = `${available.size} of ${exercises.length} exercises fit your setup.`;
}

form.addEventListener('change', () => {
  profile = readForm();
  onProfile();
});

$('#eq-share').addEventListener('click', (e) => {
  copyText(`${location.origin}${location.pathname}#${encodeProfile(profile)}`, e.currentTarget);
});

// ---------- library ----------
const lib = { filter: 'all', q: '', missing: false };
const items = $$('#exlist > .ex');

function renderSetupList(li, ex, best) {
  $$('.ex__setups > li', li).forEach((s, i) => {
    s.classList.toggle('is-best', i === best);
    s.classList.toggle('is-off', best !== null && i !== best);
  });
  let need = $('.ex__need', li);
  if (best === null) {
    const c = closestSetup(ex, profile, eq);
    if (!need) {
      need = document.createElement('p');
      need.className = 'ex__need';
      $('.ex__setup', li).prepend(need);
    }
    need.textContent = `Needs ${describeMissing(c.missing, eq).join(' and ')}.`;
  } else if (need) {
    need.remove();
  }
}

function matches(li) {
  const [kind, val] = lib.filter.split(':');
  if (kind === 'region' && li.dataset.region !== val) return false;
  if (kind === 'pattern' && li.dataset.pattern !== val) return false;
  if (lib.q && !lib.q.split(/\s+/).every((w) => li.dataset.q.includes(w))) return false;
  return true;
}

function renderLibrary() {
  const counts = { all: 0 };
  let shown = 0;
  for (const li of items) {
    const ex = exById.get(li.dataset.id);
    const best = available.has(ex.id) ? available.get(ex.id) : null;
    const ok = best !== null;
    li.classList.toggle('is-possible', ok);
    li.classList.toggle('is-missing', !ok);
    renderSetupList(li, ex, best);
    $('.ex__add', li).disabled = !ok;
    const idx = ok ? best : closestSetup(ex, profile, eq).index;
    mountFigure($('.ex__fig', li), figureSVG(ex, idx, eq));
    if (ok || lib.missing) {
      counts.all += 1;
      counts[`region:${ex.region}`] = (counts[`region:${ex.region}`] || 0) + 1;
      counts[`pattern:${ex.pattern}`] = (counts[`pattern:${ex.pattern}`] || 0) + 1;
    }
    const visible = (ok || lib.missing) && matches(li);
    li.hidden = !visible;
    if (visible) shown += 1;
  }
  $$('[data-n]').forEach((n) => { n.textContent = counts[n.dataset.n] || 0; });
  $$('[data-filter]').forEach((a) => {
    if (a.dataset.filter === lib.filter) a.setAttribute('aria-current', 'true');
    else a.removeAttribute('aria-current');
  });
  $('#libsel').value = lib.filter;
  $('#libempty').hidden = shown > 0;
  const filtered = lib.filter !== 'all' || lib.q;
  $('#library').classList.toggle('is-filtered', Boolean(filtered));
  $('#libclear').hidden = !filtered;
  $('#libsub').textContent = `${available.size} of ${exercises.length} possible`;
  $('#libstatus').textContent = `${shown} exercise${shown === 1 ? '' : 's'} shown`;
}

$$('[data-filter]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  lib.filter = a.dataset.filter;
  renderLibrary();
}));
$('#libsel').addEventListener('change', (e) => { lib.filter = e.target.value; renderLibrary(); });
$('#libq').addEventListener('input', (e) => { lib.q = e.target.value.trim().toLowerCase(); renderLibrary(); });
$('#libmissing').addEventListener('change', (e) => { lib.missing = e.target.checked; renderLibrary(); });
$('#libclear').addEventListener('click', () => {
  lib.filter = 'all';
  lib.q = '';
  $('#libq').value = '';
  renderLibrary();
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    $('#libq').focus();
  }
});

// ---------- workout ----------
const coform = $('#coform');
const work = { items: [], format: 'tabata', focus: 'full', count: 6, ...(store.get('workout') || {}) };
work.items = (work.items || []).filter((i) => exById.has(i.id));
const sprite = (document.querySelector('svg.i use') || { getAttribute: () => '' }).getAttribute('href').split('#')[0];

const saveWork = () => store.set('workout', work);

function refreshWorkout() {
  for (const it of work.items) {
    if (available.has(it.id)) it.setup = available.get(it.id);
  }
  renderWorkout();
}

function renderWorkout() {
  const list = $('#worklist');
  list.innerHTML = '';
  work.items.forEach((it, i) => {
    const ex = exById.get(it.id);
    const setup = ex.setups[it.setup] || ex.setups[0];
    const ok = available.has(it.id);
    const li = document.createElement('li');
    li.className = `wi${ok ? '' : ' is-missing'}`;
    li.innerHTML = '<div class="wi__fig" aria-hidden="true"></div><div class="wi__body"><b class="wi__name"></b><small class="wi__setup"></small></div>'
      + `<div class="wi__acts"><button type="button" class="tool" data-act="swap" title="Swap for a similar exercise"><svg class="i" aria-hidden="true"><use href="${sprite}#swap"/></svg><span class="sr-only">Swap</span></button>`
      + '<button type="button" class="tool" data-act="up" title="Move up" aria-label="Move up">↑</button>'
      + '<button type="button" class="tool" data-act="remove" title="Remove" aria-label="Remove">✕</button></div>';
    $('.wi__name', li).textContent = `${i + 1}. ${ex.name}${unilateralOf(ex, setup) ? ' (each side)' : ''}`;
    $('.wi__setup', li).textContent = ok ? describeSetup(setup, eq) : 'Not possible with your current equipment';
    $('[data-act="up"]', li).disabled = i === 0;
    mountFigure($('.wi__fig', li), figureSVG(ex, it.setup, eq));
    li.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'remove') work.items.splice(i, 1);
      if (b.dataset.act === 'up' && i > 0) [work.items[i - 1], work.items[i]] = [work.items[i], work.items[i - 1]];
      if (b.dataset.act === 'swap') work.items = swap(work.items, i, exercises, available, newSeed());
      saveWork();
      renderWorkout();
    });
    list.append(li);
  });
  const has = work.items.length > 0;
  $('#workempty').hidden = has;
  $('#workactions').hidden = !has;
  if (has) {
    const start = $('#workstart');
    start.href = `${start.href.split('#')[0]}#${encodeWorkout(work.items, work.format)}`;
    const timer = store.get('timer') || {};
    const phases = buildWorkout(work.items.map((it) => {
      const ex = exById.get(it.id);
      return { name: ex.name, unilateral: unilateralOf(ex, ex.setups[it.setup]) };
    }), { ...(timer.workout || {}), format: work.format });
    $('#worktime').textContent = `About ${Math.round(totalSeconds(phases) / 60)} min`;
  }
}

coform.elements.focus.value = work.focus;
coform.elements.count.value = String(work.count);
coform.elements.format.value = work.format;

coform.addEventListener('submit', (e) => {
  e.preventDefault();
  work.focus = coform.elements.focus.value;
  work.count = Math.min(12, Math.max(2, Number(coform.elements.count.value) || 6));
  coform.elements.count.value = String(work.count);
  work.format = coform.elements.format.value;
  work.items = compose(exercises, available, { focus: work.focus, count: work.count, seed: newSeed() });
  saveWork();
  renderWorkout();
  if (!work.items.length) $('#workempty').textContent = 'Nothing fits your equipment yet. Add an anchor point or a handle above.';
});
coform.addEventListener('change', (e) => {
  if (e.target.name === 'format') {
    work.format = e.target.value;
    saveWork();
    renderWorkout();
  }
});
$('#workclear').addEventListener('click', () => {
  work.items = [];
  saveWork();
  renderWorkout();
});
$('#exlist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (!b || !available.has(b.dataset.add)) return;
  if (!work.items.some((i) => i.id === b.dataset.add)) work.items.push({ id: b.dataset.add, setup: available.get(b.dataset.add) });
  saveWork();
  renderWorkout();
  $('.vx-compose').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

writeForm();
onProfile();
