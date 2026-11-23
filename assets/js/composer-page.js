// Composer page: equipment form ↔ profile, library filtering, figures, workout composing.
import * as P from '@params';
import { normalizeProfile, defaultProfile, availableExercises, checkSetup, closestSetup, describeMissing, describeSetup, HEIGHTS } from './lib/equipment.js';
import { compose, swap, newSeed } from './lib/compose.js';
import { buildWorkout, totalSeconds } from './lib/timeline.js';
import { encodeProfile, decodeProfile, encodeWorkout, normalizeItems, normalizeFormat } from './lib/share.js';
import { store, $, $$, figureSVG, mountFigure, anchorDemo, unilateralOf, showEachSide, copyText } from './lib/ui.js';

const eq = P.equipment;
const exercises = P.exercises;
const exById = new Map(exercises.map((e) => [e.id, e]));
const form = $('#eqform');

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

// ---------- profile ----------
// A shared setup (#u=…) is only previewed: it isn't saved over yours until you change something or keep it.
const linked = decodeProfile(location.hash);
const savedProfile = store.get('profile');
let viewingLink = Boolean(linked);
let profile = normalizeProfile(linked || savedProfile || defaultProfile(), eq);
let available = new Map(); // exercise id → the setup to use (your pick when it fits, else the best fit)

// Your pick of setup for exercises you can do more than one way (e.g. squats on the Travel Platform instead of
// with two handles). Kept per exercise, and used whenever your equipment allows it.
const choices = obj(store.get('setups'));
const fits = (ex, i) => checkSetup(ex.setups[i], profile, eq).ok;
function applyChoices() {
  for (const [id, i] of Object.entries(choices)) {
    const ex = exById.get(id);
    if (ex && available.has(id) && Number.isInteger(i) && ex.setups[i] && fits(ex, i)) available.set(id, i);
  }
}

function writeForm() {
  form.elements.units.value = String(profile.units);
  form.elements.platform.checked = profile.platform;
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
  const p = { units, platform: form.elements.platform.checked, attachments: {}, anchors: {} };
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
    const units = two && profile.anchors[a] > 1 ? 2 : 1;
    mountFigure($('.anc__fig', li), anchorDemo(a, units, exercises, eq));
    const on = a === 'platform' ? profile.platform : profile.anchors[a] > 0;
    li.classList.toggle('is-on', on);
  });
}

function onProfile() {
  if (!viewingLink) store.set('profile', profile);
  $('#eqlink').hidden = !viewingLink;
  if (location.hash.includes('u=')) history.replaceState(null, '', location.pathname + location.search);
  available = availableExercises(exercises, profile, eq);
  applyChoices();
  syncFormState();
  renderLibrary();
  refreshWorkout();
  $('#eqsum').textContent = `${available.size} of ${exercises.length} exercises fit your setup.`;
}

form.addEventListener('change', () => {
  viewingLink = false;
  profile = readForm();
  onProfile();
});
$('#eqkeep').addEventListener('click', () => {
  viewingLink = false;
  onProfile();
  saveWork();
});
$('#eqmine').addEventListener('click', () => {
  viewingLink = false;
  profile = normalizeProfile(savedProfile || defaultProfile(), eq);
  writeForm();
  onProfile();
});

$('#eq-share').addEventListener('click', (e) => {
  copyText(`${location.origin}${location.pathname}#${encodeProfile(profile)}`, e.currentTarget);
});

// ---------- library ----------
const lib = { filter: 'all', q: '', missing: false, chosen: false };
const items = $$('#exlist > .ex');

function renderSetupList(li, ex, best) {
  let n = 0;
  $$('.ex__setups > li', li).forEach((s, i) => {
    const ok = fits(ex, i);
    if (ok) n += 1;
    s.classList.toggle('is-best', i === best);
    s.classList.toggle('is-off', !ok);
    const r = $('input', s);
    r.disabled = !ok;
    r.checked = i === best;
  });
  $('.ex__choose', li).hidden = n < 2;
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

function renderCard(li) {
  const ex = exById.get(li.dataset.id);
  const best = available.has(ex.id) ? available.get(ex.id) : null;
  const ok = best !== null;
  li.classList.toggle('is-possible', ok);
  li.classList.toggle('is-missing', !ok);
  renderSetupList(li, ex, best);
  $('.ex__add', li).disabled = !ok;
  const idx = ok ? best : closestSetup(ex, profile, eq).index;
  mountFigure($('.ex__fig', li), figureSVG(ex, idx, eq, { profile }));
  showEachSide(li, ex, ex.setups[idx]);
}

function renderLibrary() {
  items.forEach(renderCard);
  applyFilter();
}

// Counts and which cards show; cheap, so it also runs whenever the workout changes ("In my workout").
function applyFilter() {
  const inWork = new Set(work.items.map((it) => it.id));
  const counts = { all: 0, chosen: inWork.size };
  let shown = 0;
  for (const li of items) {
    const ex = exById.get(li.dataset.id);
    // "Filter by selected": just your workout's exercises, even ones your equipment no longer allows
    const inSet = lib.chosen ? inWork.has(ex.id) : available.has(ex.id) || lib.missing;
    if (inSet) {
      counts.all += 1;
      counts[`region:${ex.region}`] = (counts[`region:${ex.region}`] || 0) + 1;
      counts[`pattern:${ex.pattern}`] = (counts[`pattern:${ex.pattern}`] || 0) + 1;
    }
    const visible = inSet && matches(li);
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
  $('#libempty').textContent = lib.chosen && !inWork.size
    ? 'Your workout is empty. Add exercises with “Add to workout”, or press Compose.'
    : 'Nothing matches. Try another filter, or tick “Include ones I can\'t do yet”.';
  const filtered = lib.filter !== 'all' || lib.q || lib.chosen;
  $('#library').classList.toggle('is-filtered', Boolean(filtered));
  $('#libclear').hidden = !filtered;
  $('#libsub').textContent = `${available.size} of ${exercises.length} possible`;
  $('#libstatus').textContent = `${shown} exercise${shown === 1 ? '' : 's'} shown`;
}

$$('[data-filter]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  lib.filter = a.dataset.filter;
  applyFilter();
}));
$('#libsel').addEventListener('change', (e) => { lib.filter = e.target.value; applyFilter(); });
$('#libq').addEventListener('input', (e) => { lib.q = e.target.value.trim().toLowerCase(); applyFilter(); });
$('#libmissing').addEventListener('change', (e) => { lib.missing = e.target.checked; applyFilter(); });
$('#libchosen').addEventListener('change', (e) => { lib.chosen = e.target.checked; applyFilter(); });
$('#libclear').addEventListener('click', () => {
  lib.filter = 'all';
  lib.q = '';
  lib.chosen = false;
  $('#libq').value = '';
  $('#libchosen').checked = false;
  applyFilter();
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) {
    e.preventDefault();
    $('#libq').focus();
  }
});

// ---------- workout ----------
const coform = $('#coform');
const storedWork = obj(store.get('workout'));
const FOCI = [...coform.elements.focus.options].map((o) => o.value);
const work = {
  items: normalizeItems(storedWork.items, exercises),
  format: normalizeFormat(storedWork.format),
  focus: FOCI.includes(storedWork.focus) ? storedWork.focus : 'full',
  count: Math.min(12, Math.max(2, Number(storedWork.count) || 6)),
};
const sprite = (document.querySelector('svg.i use') || { getAttribute: () => '' }).getAttribute('href').split('#')[0];

const saveWork = () => store.set('workout', work);
const say = (msg) => { $('#workstatus').textContent = msg; };
const nameOf = (id) => exById.get(id).name;

// Keep each exercise on the setup that fits the current equipment (and save it, so the timer gets it too).
function refreshWorkout() {
  let changed = false;
  for (const it of work.items) {
    if (available.has(it.id) && it.setup !== available.get(it.id)) {
      it.setup = available.get(it.id);
      changed = true;
    }
  }
  if (changed && !viewingLink) saveWork();
  renderWorkout();
}

let fresh = new Set(); // ids to animate in on the next render (just added or composed)

// Rebuilding the list destroys the focused button; `keep` = { index, act } puts focus back on the same control.
function restoreFocus(keep) {
  const rows = $$('#worklist > li');
  if (!rows.length) {
    $('#pw-h').focus();
    return;
  }
  const li = rows[Math.min(keep.index, rows.length - 1)];
  const b = $(`[data-act="${keep.act}"]`, li);
  (b && !b.disabled ? b : $('[data-act="swap"]', li)).focus();
}

function renderWorkout(keep) {
  const list = $('#worklist');
  list.innerHTML = '';
  work.items.forEach((it, i) => {
    const ex = exById.get(it.id);
    const setup = ex.setups[it.setup] || ex.setups[0];
    const ok = available.has(it.id);
    const li = document.createElement('li');
    li.className = `wi${ok ? '' : ' is-missing'}${fresh.has(it.id) ? ' is-new' : ''}`;
    li.innerHTML = '<div class="wi__fig" aria-hidden="true"></div><div class="wi__body"><b class="wi__name"></b><small class="wi__setup"></small></div>'
      + `<div class="wi__acts"><button type="button" class="tool" data-act="swap"><svg class="i" aria-hidden="true"><use href="${sprite}#swap"/></svg></button>`
      + '<button type="button" class="tool" data-act="up">↑</button>'
      + '<button type="button" class="tool" data-act="remove">✕</button></div>';
    $('.wi__name', li).textContent = `${i + 1}. ${ex.name}${unilateralOf(ex, setup) ? ' (each side)' : ''}`;
    $('.wi__setup', li).textContent = ok ? describeSetup(setup, eq) : 'Not possible with your equipment: swap or remove it';
    for (const [act, label] of [['swap', `Swap ${ex.name} for a similar exercise`], ['up', `Move ${ex.name} up`], ['remove', `Remove ${ex.name}`]]) {
      const b = $(`[data-act="${act}"]`, li);
      b.setAttribute('aria-label', label);
      b.title = label;
    }
    $('[data-act="up"]', li).disabled = i === 0;
    mountFigure($('.wi__fig', li), figureSVG(ex, it.setup, eq, { profile }));
    li.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      let index = i;
      if (act === 'remove') {
        work.items.splice(i, 1);
        say(`Removed ${ex.name}.`);
      }
      if (act === 'up' && i > 0) {
        [work.items[i - 1], work.items[i]] = [work.items[i], work.items[i - 1]];
        index = i - 1;
        say(`Moved ${ex.name} to position ${i}.`);
      }
      if (act === 'swap') {
        work.items = swap(work.items, i, exercises, available, newSeed());
        const now = work.items[i].id;
        if (now === it.id) say(`Nothing else fits in place of ${ex.name}.`);
        else {
          fresh = new Set([now]);
          say(`Swapped ${ex.name} for ${nameOf(now)}.`);
        }
      }
      saveWork();
      renderWorkout({ index, act });
    });
    list.append(li);
  });
  fresh = new Set();
  const has = work.items.length > 0;
  const n = work.items.length;
  const label = `${n} exercise${n === 1 ? '' : 's'}`;
  const blocked = work.items.filter((it) => !available.has(it.id)).length;
  $('#workempty').hidden = has;
  $('#workactions').hidden = !has;
  $('#workcount').textContent = has ? label : '';
  // "Add to workout" buttons show what's already in
  const inWork = new Set(work.items.map((it) => it.id));
  $$('.ex__add').forEach((b) => {
    const on = inWork.has(b.dataset.add);
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-on', on);
    b.querySelector('span').textContent = on ? 'Added' : 'Add to workout';
    b.closest('.ex').classList.toggle('is-added', on);
  });
  applyFilter();
  $('#workfab').hidden = !has;
  $('#shuffle').disabled = n < 2;
  if (has) {
    const start = $('#workstart');
    const fab = $('#fabstart');
    const href = `${start.href.split('#')[0]}#${encodeWorkout(work.items, work.format)}`;
    // Don't send exercises the equipment no longer allows to the timer.
    for (const a of [start, fab]) {
      a.href = href;
      a.classList.toggle('is-disabled', blocked > 0);
      if (blocked) a.setAttribute('aria-disabled', 'true');
      else a.removeAttribute('aria-disabled');
    }
    $('#fabcount').textContent = label;
    $('#fabnames').textContent = work.items.map((it) => nameOf(it.id)).join(' · ');
    const timer = obj(store.get('timer'));
    const phases = buildWorkout(work.items.map((it) => {
      const ex = exById.get(it.id);
      return { name: ex.name, unilateral: unilateralOf(ex, ex.setups[it.setup]) };
    }), { ...obj(timer.workout), format: work.format });
    $('#worktime').textContent = blocked
      ? `Swap or remove ${blocked === 1 ? 'the exercise' : `the ${blocked} exercises`} your equipment doesn't allow first.`
      : `About ${Math.round(totalSeconds(phases) / 60)} min`;
    $('#worktime').classList.toggle('is-warn', blocked > 0);
  }
  if (keep) restoreFocus(keep);
}
for (const a of [$('#workstart'), $('#fabstart')]) {
  a.addEventListener('click', (e) => {
    if (a.getAttribute('aria-disabled') === 'true') e.preventDefault();
  });
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
  fresh = new Set(work.items.map((it) => it.id));
  saveWork();
  renderWorkout();
  say(work.items.length ? `Composed ${work.items.length} exercises: ${work.items.map((it) => nameOf(it.id)).join(', ')}.` : '');
  if (!work.items.length) $('#workempty').textContent = 'Nothing fits your equipment yet. Add an anchor point or a handle above.';
  else if (!drawerMode()) showWorkout();
});
coform.addEventListener('change', (e) => {
  if (e.target.name === 'format') {
    work.format = normalizeFormat(e.target.value);
    saveWork();
    renderWorkout();
  }
});
// Shuffle: a new random order for the exercises you have (always different from the current one).
$('#shuffle').addEventListener('click', () => {
  const n = work.items.length;
  if (n < 2) return;
  const before = work.items.map((it) => it.id).join();
  do {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [work.items[i], work.items[j]] = [work.items[j], work.items[i]];
    }
  } while (work.items.map((it) => it.id).join() === before);
  fresh = new Set(work.items.map((it) => it.id));
  saveWork();
  renderWorkout();
  say(`Shuffled: ${work.items.map((it) => nameOf(it.id)).join(', ')}.`);
  if (!drawerMode()) showWorkout();
});
$('#workclear').addEventListener('click', () => {
  work.items = [];
  saveWork();
  renderWorkout({ index: 0, act: 'swap' });
  say('Workout cleared.');
});
$('#exlist').addEventListener('change', (e) => {
  const r = e.target.closest('.ex__setups input');
  if (!r) return;
  const li = r.closest('.ex');
  const ex = exById.get(li.dataset.id);
  const i = Number(r.value);
  if (!available.has(ex.id) || available.get(ex.id) === i || !fits(ex, i)) return;
  choices[ex.id] = i;
  store.set('setups', choices);
  available.set(ex.id, i);
  renderCard(li);
  refreshWorkout();
  say(`${ex.name}: ${describeSetup(ex.setups[i], eq)}.`);
});
$('#exlist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (!b || !available.has(b.dataset.add)) return;
  const id = b.dataset.add;
  const at = work.items.findIndex((i) => i.id === id);
  if (at >= 0) {
    work.items.splice(at, 1);
    say(`Removed ${nameOf(id)}.`);
  } else {
    work.items.push({ id, setup: available.get(id) });
    fresh = new Set([id]);
    say(`Added ${nameOf(id)}. ${work.items.length} in your workout.`);
  }
  saveWork();
  renderWorkout();
  const added = $('#worklist .is-new');
  if (added && !drawerMode()) added.scrollIntoView({ block: 'nearest' });
});

// The workout lives in the panel: in view on wide screens, in the drawer on phones.
const drawerMode = () => {
  const bar = $('.topbar');
  return Boolean(bar) && getComputedStyle(bar).display !== 'none';
};
function showWorkout() {
  const open = $('.topbar [data-open]');
  if (drawerMode() && open) open.click();
  const w = $('#workout');
  requestAnimationFrame(() => {
    w.scrollIntoView({ block: 'nearest' });
    w.classList.remove('is-flash');
    void w.offsetWidth; // restart the highlight
    w.classList.add('is-flash');
  });
}
$$('.cx-jump, .cx-fab__open').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  showWorkout();
}));

writeForm();
onProfile();
