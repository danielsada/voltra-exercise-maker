// Timer page: Tabata, Interval and Workout modes on the timestamp-based Engine.
import * as P from '@params';
import { Engine } from './lib/engine.js';
import { TABATA_DEFAULTS, VOLLAARD_DEFAULTS, INTERVAL_DEFAULTS, WORKOUT_DEFAULTS, buildTabata, buildVollaard, buildInterval, buildWorkout, clampConfig, totalSeconds, formatTime } from './lib/timeline.js';
import { decodeWorkout, encodeWorkout, normalizeItems, normalizeFormat } from './lib/share.js';
import { describeSetup, checkSetup, normalizeProfile } from './lib/equipment.js';
import { store, $, $$, figureSVG, unilateralOf } from './lib/ui.js';

const eq = P.equipment;
const exercises = P.exercises;
const exById = new Map(exercises.map((e) => [e.id, e]));
const stage = $('.tm__stage');
const setform = $('#setform');
const sprite = ($('svg.i use') || { getAttribute: () => '' }).getAttribute('href').split('#')[0];

// ---------- settings ----------
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
function normWorkout(raw) {
  const w = obj(raw);
  const base = clampConfig(w, { prep: WORKOUT_DEFAULTS.prep, exRest: WORKOUT_DEFAULTS.exRest, circuits: WORKOUT_DEFAULTS.circuits, circuitRest: WORKOUT_DEFAULTS.circuitRest });
  return {
    ...base,
    format: normalizeFormat(w.format),
    tabata: clampConfig(obj(w.tabata), WORKOUT_DEFAULTS.tabata),
    interval: clampConfig(obj(w.interval), WORKOUT_DEFAULTS.interval),
  };
}
const saved = obj(store.get('timer'));
const cfg = {
  tabata: clampConfig(obj(saved.tabata), TABATA_DEFAULTS),
  vollaard: clampConfig(obj(saved.vollaard), VOLLAARD_DEFAULTS),
  interval: clampConfig(obj(saved.interval), INTERVAL_DEFAULTS),
  workout: normWorkout(saved.workout),
  opts: { sound: true, voice: false, vibe: true, ...obj(saved.opts) },
};
const saveCfg = () => store.set('timer', { ...cfg, mode });

// ---------- workout items: from a link (#w=…) or from the composer (saved in this browser) ----------
// A link's workout stays in the URL (next to #mode=…) so switching modes and reloading keeps it.
const linkParams = new URLSearchParams(location.hash.replace(/^#/, ''));
const fromLink = decodeWorkout(location.hash, exercises);
let linkPart = fromLink ? encodeWorkout(fromLink.items, fromLink.format) : '';
const savedWork = obj(store.get('workout'));
const workout = fromLink || { items: normalizeItems(savedWork.items, exercises), format: normalizeFormat(savedWork.format || cfg.workout.format) };
cfg.workout.format = workout.format;
const badLink = Boolean(fromLink && !fromLink.items.length);
const plan = workout.items.map((it) => {
  const ex = exById.get(it.id);
  const setup = ex.setups[it.setup] || ex.setups[0];
  return { ex, setupIndex: it.setup, setup, name: ex.name, unilateral: unilateralOf(ex, setup) };
});

const MODES = ['tabata', 'vollaard', 'interval', 'workout'];
let mode = MODES.includes(linkParams.get('mode')) ? linkParams.get('mode')
  : fromLink ? 'workout' : MODES.includes(saved.mode) ? saved.mode : 'tabata';

// ---------- engine ----------
let engine;
let lastSec = null;
let shownItem = null;

function phasesFor() {
  if (mode === 'workout') return buildWorkout(plan, cfg.workout);
  if (mode === 'vollaard') return buildVollaard(cfg.vollaard);
  return mode === 'tabata' ? buildTabata(cfg.tabata) : buildInterval(cfg.interval);
}

function build() {
  if (engine) engine.pause();
  engine = new Engine(phasesFor(), { onPhase });
  lastSec = null;
  shownItem = null;
  wake(false);
  stage.classList.remove('is-go', 'is-final');
  render();
}

const pristine = () => engine.index === 0 && engine.elapsed() === 0 && !engine.running;

// ---------- cues ----------
let ac = null;
function audio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ac = new AC();
  }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function beep(freq, dur = 0.12, when = 0, vol = 0.3) {
  if (!cfg.opts.sound || !audio()) return;
  const t = ac.currentTime + when;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
const vibrate = (p) => { if (cfg.opts.vibe && navigator.vibrate) navigator.vibrate(p); };

// Spoken cues use on-device voices only (voice.localService), so no text leaves the browser.
const synth = window.speechSynthesis;
const localVoice = () => {
  if (!synth) return null;
  const vs = synth.getVoices().filter((v) => v.localService);
  return vs.find((v) => v.lang.startsWith('en')) || vs[0] || null;
};
function speak(text) {
  if (!cfg.opts.voice || !text) return;
  const v = localVoice();
  if (!v) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = v;
  u.lang = v.lang;
  synth.speak(u);
}

// The screen stays on while the timer runs. `wantLock` is the latest wish, so a request that resolves after a pause
// is released straight away.
let lock = null;
let wantLock = false;
let requesting = false;
async function wake(on) {
  wantLock = on;
  try {
    if (on && !lock && !requesting && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      requesting = true;
      const l = await navigator.wakeLock.request('screen');
      requesting = false;
      l.addEventListener('release', () => { if (lock === l) lock = null; });
      if (wantLock) lock = l;
      else await l.release();
    } else if (!on && lock) {
      const l = lock;
      lock = null;
      await l.release();
    }
  } catch {
    requesting = false;
  }
}

const SIDE = { left: 'left side', right: 'right side' };
function spokenFor(p) {
  if (p.kind === 'work' && mode === 'workout') return `${p.label}${p.side ? `, ${SIDE[p.side]}` : ''}`;
  if (p.kind === 'setRest' && mode === 'workout' && plan[p.item]) return `Rest. Next, ${plan[p.item].name}`;
  return p.say || phaseText(p);
}

function onPhase(_, p) {
  lastSec = null;
  const announce = $('#announce');
  if (p.kind === 'done') {
    beep(660, 0.15); beep(880, 0.15, 0.18); beep(1320, 0.45, 0.36);
    vibrate([200, 100, 200, 100, 400]);
    speak('Done. Nice work.');
    announce.textContent = 'Done';
    wake(false);
    return;
  }
  if (!engine || !engine.running) return;
  if (p.kind === 'work') {
    beep(1320, 0.35);
    vibrate(300);
    stage.classList.remove('is-go');
    void stage.offsetWidth; // restart the GO flash
    stage.classList.add('is-go');
  } else {
    beep(520, 0.35);
    vibrate([120, 80, 120]);
  }
  speak(spokenFor(p));
  announce.textContent = `${phaseText(p)}${p.kind === 'work' && mode === 'workout' ? `: ${p.label}` : ''}`;
}

// ---------- render ----------
function phaseText(p) {
  if (p.title) return p.title;
  return { prep: 'Get ready', work: 'Work', rest: 'Rest', setRest: p.label, done: 'Done' }[p.kind] || p.label;
}

function countText(p) {
  if (p.kind === 'done') return mode === 'workout' ? `${plan.length} exercises` : '';
  const parts = [];
  if (mode === 'workout') {
    if (p.item !== undefined) parts.push(`${p.kind === 'work' || p.kind === 'rest' ? 'Exercise' : 'Up next'} ${p.item + 1}/${plan.length}`);
    if (p.kind === 'work' || p.kind === 'rest') parts.push(`Round ${p.round}/${p.rounds}`);
    if (p.sets > 1) parts.push(`Circuit ${p.set}/${p.sets}`);
  } else if (mode === 'vollaard') {
    if (p.kind === 'work') parts.push(`Sprint ${p.round}/${p.rounds}`);
    if (p.kind === 'rest') parts.push(`Sprint ${p.round + 1}/${p.rounds} next`);
  } else {
    if (p.kind !== 'prep') parts.push(`Round ${p.round}/${p.rounds}`);
    if (p.sets > 1) parts.push(`${mode === 'tabata' ? 'Tabata' : 'Set'} ${p.set}/${p.sets}`);
  }
  return parts.join(' · ');
}

function renderExercise(p) {
  const box = $('#exnow');
  if (mode !== 'workout' || p.item === undefined || !plan[p.item]) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const it = plan[p.item];
  if (shownItem !== p.item) {
    shownItem = p.item;
    $('#exfig').innerHTML = figureSVG(it.ex, it.setupIndex, eq, { title: it.name });
    $('#exname').textContent = it.name;
    $('#exsetup').textContent = describeSetup(it.setup, eq) + (it.setup.note ? `. ${it.setup.note}` : '');
    $('#excue').textContent = it.ex.cue || '';
    $('#exchange').hidden = choicesFor(it).length < 2;
  }
  const side = p.side ? SIDE[p.side][0].toUpperCase() + SIDE[p.side].slice(1) : (it.unilateral ? 'Each side' : '');
  $('#exside').textContent = p.kind === 'work' ? side : `Up next${side ? ` · ${side}` : ''}`;
  const svg = $('#exfig svg');
  if (svg && svg.pauseAnimations) {
    if (p.kind === 'work' && engine.running) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }
}

function renderPlan(p) {
  $$('#planlist > li').forEach((li, i) => {
    li.classList.toggle('is-current', p.kind !== 'done' && p.item === i);
    li.classList.toggle('is-done', p.kind === 'done' || (p.item !== undefined && i < p.item));
  });
}

function setGo(icon, text) {
  const go = $('#go');
  go.querySelector('use').setAttribute('href', `${sprite}#${icon}`);
  go.querySelector('span').textContent = text;
  go.setAttribute('aria-label', `${text} (Space)`);
}

function render() {
  const s = engine.update();
  const p = s.phase;
  const idle = pristine();
  const empty = engine.phases.length <= 1;
  stage.dataset.phase = idle || empty ? 'idle' : s.done ? 'done' : p.kind;
  stage.classList.toggle('is-paused', !s.running && !idle && !s.done);
  const sec = s.done ? 0 : Math.ceil(s.remaining / 1000);
  $('#phase').textContent = idle ? (mode === 'workout' && !plan.length ? 'No workout' : 'Ready') : phaseText(p);
  $('#time').textContent = formatTime(idle ? p.seconds : sec);
  $('#count').textContent = countText(p);
  const total = totalSeconds(engine.phases);
  $('#ringfill').style.strokeDashoffset = String(Math.round(1000 * (1 - (idle || empty ? 0 : s.done ? 1 : s.progress))));
  $('#totalbar').style.width = `${total ? (100 * s.totalElapsed) / (total * 1000) : 0}%`;
  $('#elapsed').textContent = formatTime(s.totalElapsed / 1000);
  $('#remaining').textContent = formatTime(s.totalRemaining / 1000);
  const n = s.next;
  $('#next').textContent = n && n.kind !== 'done' ? ` · Next: ${n.kind === 'work' && mode === 'workout' ? n.label : phaseText(n)} ${formatTime(n.seconds)}` : '';
  // last three seconds: a beep each second and a pulse
  const final = s.running && !s.done && p.seconds > 3 && sec <= 3;
  stage.classList.toggle('is-final', final);
  if (final && sec !== lastSec && sec >= 1) beep(880, 0.09);
  lastSec = sec;
  renderExercise(p);
  renderPlan(p);
  if (idle || empty) setGo('play', 'Start');
  else if (s.done) setGo('reset', 'Again');
  else if (s.running) setGo('pause', 'Pause');
  else setGo('play', 'Resume');
  for (const id of ['#go', '#back', '#skip', '#reset']) $(id).disabled = empty;
  document.title = s.running ? `${formatTime(sec)} ${phaseText(p)} · Timer` : baseTitle;
  return s;
}
const baseTitle = document.title;

let raf = 0;
function loop() {
  const s = render();
  raf = s.running ? requestAnimationFrame(loop) : 0;
}
// Browsers don't run animation frames in a hidden tab; a coarse interval keeps the cues coming (throttled to
// about once a second, which the beeps tolerate).
let ticker = 0;
function kick() {
  if (!raf) raf = requestAnimationFrame(loop);
  if (!ticker) {
    ticker = setInterval(() => {
      if (!engine.running) { clearInterval(ticker); ticker = 0; return; }
      if (document.hidden) render();
    }, 250);
  }
}

// ---------- controls ----------
function toggle() {
  if (engine.phases.length <= 1) return;
  audio();
  if (engine.done) {
    build();
    engine.start();
    onPhase(0, engine.phase);
  } else {
    // starting at the very beginning of a phase (also after Skip/Back while paused) gets its cues
    const atStart = !engine.running && engine.elapsed() === 0;
    engine.toggle();
    if (atStart && engine.running) onPhase(engine.index, engine.phase);
  }
  wake(engine.running);
  render();
  kick();
}
$('#go').addEventListener('click', toggle);
$('#skip').addEventListener('click', () => { engine.skip(); render(); kick(); });
$('#back').addEventListener('click', () => { engine.back(); render(); kick(); });
$('#reset').addEventListener('click', build);

document.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest('input, select, textarea, button, a, label')) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.key === 'ArrowRight') { engine.skip(); render(); kick(); }
  else if (e.key === 'ArrowLeft') { engine.back(); render(); kick(); }
  else if (e.key === 'r' || e.key === 'R') build();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (engine.running) wake(true);
    render();
    kick();
  }
});

for (const [id, key] of [['#optsound', 'sound'], ['#optvoice', 'voice'], ['#optvibe', 'vibe']]) {
  const el = $(id);
  el.checked = Boolean(cfg.opts[key]);
  el.addEventListener('change', () => {
    cfg.opts[key] = el.checked;
    saveCfg();
    if (key === 'voice' && el.checked) speak('Voice on');
    if (key === 'sound' && el.checked) beep(880, 0.1);
  });
}
if (!navigator.vibrate) $('#optvibe').closest('label').hidden = true;
function checkVoices() {
  const label = $('#optvoice').closest('label');
  label.hidden = !synth;
  if (synth && !localVoice()) {
    $('#optvoice').disabled = true;
    label.title = 'No on-device voice is installed in this browser';
  } else {
    $('#optvoice').disabled = false;
    label.title = '';
  }
}
checkVoices();
if (synth) synth.addEventListener('voiceschanged', checkVoices);

// ---------- settings form ----------
// form field name → setting, for the modes with a single config
const FIELDS = { prep: 'prep', work: 'work', rest: 'rest', rounds: 'rounds', sets: 'sets', setRest: 'setRest' };
const VFIELDS = { vprep: 'prep', vwork: 'work', vrest: 'rest', vrounds: 'rounds', vcool: 'coolDown' };
const DEFAULTS = { tabata: TABATA_DEFAULTS, vollaard: VOLLAARD_DEFAULTS, interval: INTERVAL_DEFAULTS };
const fieldsOf = (m) => (m === 'vollaard' ? VFIELDS : FIELDS);
const WFIELDS = { wprep: ['prep'], exRest: ['exRest'], circuits: ['circuits'], circuitRest: ['circuitRest'], wwork: ['block', 'work'], wrest: ['block', 'rest'], wrounds: ['block', 'rounds'] };

function fillForm() {
  const el = setform.elements;
  if (mode === 'workout') {
    const w = cfg.workout;
    el.format.value = w.format;
    for (const [name, path] of Object.entries(WFIELDS)) {
      el[name].value = path[0] === 'block' ? w[w.format][path[1]] : w[path[0]];
    }
  } else {
    for (const [name, key] of Object.entries(fieldsOf(mode))) el[name].value = cfg[mode][key];
  }
  $$('.setgrid').forEach((g) => { g.hidden = !g.dataset.for.split(' ').includes(mode); });
  $('[data-label-sets]').textContent = mode === 'tabata' ? 'Tabatas' : 'Sets';
  $('#set-h').textContent = { tabata: 'Tabata', vollaard: 'Vollaard (REHIT)', interval: 'Interval', workout: 'Workout' }[mode] + ' settings';
}

function readForm() {
  const el = setform.elements;
  if (mode === 'workout') {
    const w = cfg.workout;
    const fmtChanged = el.format.value !== w.format;
    w.format = normalizeFormat(el.format.value);
    // keep the composer's saved workout in step, so the format sticks next time
    if (fmtChanged && !fromLink) store.set('workout', { ...savedWork, items: workout.items, format: w.format });
    if (fmtChanged && fromLink) {
      linkPart = encodeWorkout(workout.items, w.format);
      history.replaceState(null, '', `${location.pathname}#mode=${mode}&${linkPart}`);
    }
    if (!fmtChanged) {
      const raw = { ...w, tabata: { ...w.tabata }, interval: { ...w.interval } };
      for (const [name, path] of Object.entries(WFIELDS)) {
        if (path[0] === 'block') raw[w.format][path[1]] = el[name].value;
        else raw[path[0]] = el[name].value;
      }
      cfg.workout = normWorkout(raw);
    }
  } else {
    const raw = {};
    for (const [name, key] of Object.entries(fieldsOf(mode))) raw[key] = el[name].value;
    cfg[mode] = clampConfig(raw, DEFAULTS[mode]);
  }
  saveCfg();
}

function noteFor() {
  const parts = [`Total ${formatTime(totalSeconds(phasesFor()))}`];
  if (!pristine()) parts.push('changes apply when you reset');
  const w = cfg.workout;
  if (mode === 'workout' && w.format === 'tabata' && plan.some((it) => it.unilateral) && (w.tabata.rounds * w.circuits) % 2) {
    parts.push('one-sided exercises alternate sides each round, so with an odd number of rounds one side gets an extra round');
  }
  $('#setnote').textContent = `${parts.join(' · ')}.`;
}

setform.addEventListener('change', () => {
  readForm();
  fillForm();
  if (pristine()) build();
  noteFor();
});
setform.addEventListener('submit', (e) => e.preventDefault());
$('#defaults').addEventListener('click', () => {
  if (mode !== 'workout') cfg[mode] = { ...DEFAULTS[mode] };
  else cfg.workout = normWorkout({ format: cfg.workout.format });
  saveCfg();
  fillForm();
  if (pristine()) build();
  noteFor();
});

// ---------- workout plan ----------
// Setups you can switch to: the ones your saved equipment allows (any, if you haven't set it up here), plus the one in use.
const savedProfile = store.get('profile');
const myProfile = savedProfile ? normalizeProfile(savedProfile, eq) : null;
const choicesFor = (it) => it.ex.setups.map((s, i) => i).filter((i) => i === it.setupIndex || !myProfile || checkSetup(it.ex.setups[i], myProfile, eq).ok);

function renderPlanItem(li, it, i) {
  li.querySelector('.wi__fig').innerHTML = figureSVG(it.ex, it.setupIndex, eq, { animate: false });
  li.querySelector('.wi__name').textContent = `${i + 1}. ${it.name}${it.unilateral ? ' (each side)' : ''}`;
  const text = li.querySelector('.wi__setup');
  if (text) text.textContent = describeSetup(it.setup, eq);
  li.querySelectorAll('.opts input').forEach((r) => { r.checked = Number(r.value) === it.setupIndex; });
}

function renderPlanList() {
  const list = $('#planlist');
  list.innerHTML = '';
  plan.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = 'wi';
    li.id = `plan-${i}`;
    li.innerHTML = '<div class="wi__fig" aria-hidden="true"></div><div class="wi__body"><b class="wi__name"></b><small class="wi__setup"></small></div>';
    const opts = choicesFor(it);
    if (opts.length > 1) {
      // the radios replace the setup line
      const ul = document.createElement('ul');
      ul.className = 'opts';
      ul.setAttribute('role', 'radiogroup');
      ul.setAttribute('aria-label', `Setup for ${it.name}`);
      for (const s of opts) {
        const o = document.createElement('li');
        o.innerHTML = `<label class="opt"><input type="radio" name="plan-setup-${i}" value="${s}"><span></span></label>`;
        o.querySelector('span').textContent = describeSetup(it.ex.setups[s], eq);
        ul.append(o);
      }
      li.querySelector('.wi__setup').replaceWith(ul);
    }
    renderPlanItem(li, it, i);
    list.append(li);
  });
  $('#planempty').hidden = plan.length > 0;
  if (badLink) $('#planempty').textContent = "This workout link doesn't contain any exercise this site knows. It may be from an older version; compose a new one.";
  $('#planedit').hidden = !plan.length;
}

// Switching an exercise's setup here also updates the composer's workout (or the link) and its remembered choice.
$('#planlist').addEventListener('change', (e) => {
  const r = e.target.closest('.opts input');
  if (!r) return;
  const i = Number(r.closest('.wi').id.slice(5));
  const it = plan[i];
  const s = Number(r.value);
  const wasOneSided = it.unilateral;
  Object.assign(it, { setupIndex: s, setup: it.ex.setups[s], unilateral: unilateralOf(it.ex, it.ex.setups[s]) });
  workout.items[i].setup = s;
  if (fromLink) {
    linkPart = encodeWorkout(workout.items, cfg.workout.format);
    history.replaceState(null, '', `${location.pathname}#mode=${mode}&${linkPart}`);
  } else {
    store.set('workout', { ...obj(store.get('workout')), items: workout.items });
  }
  store.set('setups', { ...obj(store.get('setups')), [it.ex.id]: s });
  renderPlanItem(r.closest('.wi'), it, i);
  shownItem = null;
  // one side or both changes the rounds, so the timer is rebuilt; mid-workout that waits until you reset
  if (wasOneSided !== it.unilateral && pristine()) build();
  else render();
  noteFor();
  $('#announce').textContent = `${it.name}: ${describeSetup(it.setup, eq)}`;
});
$('#exchange').addEventListener('click', () => {
  const li = shownItem !== null && $(`#plan-${shownItem}`);
  if (!li) return;
  li.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const r = $('.opts input:checked', li);
  if (r) r.focus({ preventScroll: true });
});

// ---------- mode ----------
function setMode(m, fromUser) {
  mode = m;
  $$('input[name="mode"]').forEach((r) => { r.checked = r.value === m; });
  $('#plan').hidden = m !== 'workout';
  if (fromUser) {
    saveCfg();
    history.replaceState(null, '', `${location.pathname}#mode=${m}${linkPart ? `&${linkPart}` : ''}`);
  }
  fillForm();
  build();
  noteFor();
}
$$('input[name="mode"]').forEach((r) => r.addEventListener('change', () => setMode(r.value, true)));

renderPlanList();
setMode(mode, false);
