// Timer page: Tabata, Interval and Workout modes on the timestamp-based Engine.
import * as P from '@params';
import { Engine } from './lib/engine.js';
import { TABATA_DEFAULTS, INTERVAL_DEFAULTS, WORKOUT_DEFAULTS, buildTabata, buildInterval, buildWorkout, clampConfig, totalSeconds, formatTime } from './lib/timeline.js';
import { decodeWorkout } from './lib/share.js';
import { describeSetup } from './lib/equipment.js';
import { store, $, $$, figureSVG, unilateralOf } from './lib/ui.js';

const eq = P.equipment;
const exercises = P.exercises;
const exById = new Map(exercises.map((e) => [e.id, e]));
const stage = $('.tm__stage');
const setform = $('#setform');
const sprite = ($('svg.i use') || { getAttribute: () => '' }).getAttribute('href').split('#')[0];

// ---------- settings ----------
function normWorkout(w = {}) {
  const base = clampConfig(w, { prep: WORKOUT_DEFAULTS.prep, exRest: WORKOUT_DEFAULTS.exRest, circuits: WORKOUT_DEFAULTS.circuits, circuitRest: WORKOUT_DEFAULTS.circuitRest });
  return {
    ...base,
    format: w.format === 'interval' ? 'interval' : 'tabata',
    tabata: clampConfig(w.tabata, WORKOUT_DEFAULTS.tabata),
    interval: clampConfig(w.interval, WORKOUT_DEFAULTS.interval),
  };
}
const saved = store.get('timer') || {};
const cfg = {
  tabata: clampConfig(saved.tabata, TABATA_DEFAULTS),
  interval: clampConfig(saved.interval, INTERVAL_DEFAULTS),
  workout: normWorkout(saved.workout),
  opts: { sound: true, voice: false, vibe: true, ...(saved.opts || {}) },
};
const saveCfg = () => store.set('timer', { ...cfg, mode });

// ---------- workout items: from the link (#w=…) or from the composer ----------
let workout = decodeWorkout(location.hash, exercises);
if (workout) {
  cfg.workout.format = workout.format;
} else {
  const w = store.get('workout');
  const items = ((w && w.items) || []).filter((i) => exById.has(i.id));
  workout = { items, format: (w && w.format) || cfg.workout.format };
}
const plan = workout.items.map((it) => {
  const ex = exById.get(it.id);
  const setup = ex.setups[it.setup] || ex.setups[0];
  return { ex, setupIndex: it.setup, setup, name: ex.name, unilateral: unilateralOf(ex, setup) };
});

let mode = /w=/.test(location.hash) ? 'workout' : (location.hash.match(/mode=(tabata|interval|workout)/) || [])[1] || saved.mode || 'tabata';

// ---------- engine ----------
let engine;
let lastSec = null;
let shownItem = null;

function phasesFor() {
  if (mode === 'workout') return buildWorkout(plan, cfg.workout);
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

let lock = null;
async function wake(on) {
  try {
    if (on && !lock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    lock = null;
  }
}

const SIDE = { left: 'left side', right: 'right side' };
function spokenFor(p) {
  if (p.kind === 'work' && mode === 'workout') return `${p.label}${p.side ? `, ${SIDE[p.side]}` : ''}`;
  if (p.kind === 'setRest' && mode === 'workout' && plan[p.item]) return `Rest. Next, ${plan[p.item].name}`;
  return phaseText(p);
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
  return { prep: 'Get ready', work: 'Work', rest: 'Rest', setRest: p.label, done: 'Done' }[p.kind] || p.label;
}

function countText(p) {
  if (p.kind === 'done') return mode === 'workout' ? `${plan.length} exercises` : '';
  const parts = [];
  if (mode === 'workout') {
    if (p.item !== undefined) parts.push(`${p.kind === 'work' || p.kind === 'rest' ? 'Exercise' : 'Up next'} ${p.item + 1}/${plan.length}`);
    if (p.kind === 'work' || p.kind === 'rest') parts.push(`Round ${p.round}/${p.rounds}`);
    if (p.sets > 1) parts.push(`Circuit ${p.set}/${p.sets}`);
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
  }
  const side = p.side ? SIDE[p.side][0].toUpperCase() + SIDE[p.side].slice(1) : (it.unilateral ? 'Each side' : '');
  $('#exside').textContent = p.kind === 'work' || p.kind === 'rest' ? side : `Up next${side ? ` · ${side}` : ''}`;
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
  stage.dataset.phase = s.done ? 'done' : idle ? 'idle' : p.kind;
  stage.classList.toggle('is-paused', !s.running && !idle && !s.done);
  const sec = s.done ? 0 : Math.ceil(s.remaining / 1000);
  $('#phase').textContent = idle ? (mode === 'workout' && !plan.length ? 'No workout' : 'Ready') : phaseText(p);
  $('#time').textContent = formatTime(idle ? p.seconds : sec);
  $('#count').textContent = countText(p);
  const total = totalSeconds(engine.phases);
  $('#ringfill').style.strokeDashoffset = String(Math.round(1000 * (1 - (s.done ? 1 : s.progress))));
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
  if (s.done) setGo('reset', 'Again');
  else if (s.running) setGo('pause', 'Pause');
  else setGo('play', idle ? 'Start' : 'Resume');
  $('#go').disabled = engine.phases.length <= 1;
  document.title = s.running ? `${formatTime(sec)} ${phaseText(p)} · Timer` : baseTitle;
  return s;
}
const baseTitle = document.title;

let raf = 0;
function loop() {
  const s = render();
  raf = s.running ? requestAnimationFrame(loop) : 0;
}
function kick() {
  if (!raf) raf = requestAnimationFrame(loop);
}

// ---------- controls ----------
function toggle() {
  audio();
  if (engine.done) {
    build();
    engine.start();
    onPhase(0, engine.phase);
  } else {
    const first = pristine();
    engine.toggle();
    if (first && engine.running) onPhase(0, engine.phase);
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
const FIELDS = ['prep', 'work', 'rest', 'rounds', 'sets', 'setRest'];
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
    for (const f of FIELDS) el[f].value = cfg[mode][f];
  }
  $$('.setgrid').forEach((g) => { g.hidden = !g.dataset.for.split(' ').includes(mode); });
  $('[data-label-sets]').textContent = mode === 'tabata' ? 'Tabatas' : 'Sets';
  $('#set-h').textContent = mode === 'tabata' ? 'Tabata settings' : mode === 'interval' ? 'Interval settings' : 'Workout settings';
}

function readForm() {
  const el = setform.elements;
  if (mode === 'workout') {
    const w = cfg.workout;
    const fmtChanged = el.format.value !== w.format;
    w.format = el.format.value === 'interval' ? 'interval' : 'tabata';
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
    for (const f of FIELDS) raw[f] = el[f].value;
    cfg[mode] = clampConfig(raw, mode === 'tabata' ? TABATA_DEFAULTS : INTERVAL_DEFAULTS);
  }
  saveCfg();
}

function noteFor() {
  const parts = [`Total ${formatTime(totalSeconds(phasesFor()))}`];
  if (!pristine()) parts.push('changes apply when you reset');
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
  if (mode === 'tabata') cfg.tabata = { ...TABATA_DEFAULTS };
  else if (mode === 'interval') cfg.interval = { ...INTERVAL_DEFAULTS };
  else cfg.workout = normWorkout({ format: cfg.workout.format });
  saveCfg();
  fillForm();
  build();
  noteFor();
});

// ---------- workout plan ----------
function renderPlanList() {
  const list = $('#planlist');
  list.innerHTML = '';
  plan.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = 'wi';
    li.innerHTML = '<div class="wi__fig" aria-hidden="true"></div><div class="wi__body"><b class="wi__name"></b><small class="wi__setup"></small></div>';
    li.querySelector('.wi__fig').innerHTML = figureSVG(it.ex, it.setupIndex, eq, { animate: false });
    li.querySelector('.wi__name').textContent = `${i + 1}. ${it.name}${it.unilateral ? ' (each side)' : ''}`;
    li.querySelector('.wi__setup').textContent = describeSetup(it.setup, eq);
    list.append(li);
  });
  $('#planempty').hidden = plan.length > 0;
  $('#planedit').hidden = !plan.length;
}

// ---------- mode ----------
function setMode(m, fromUser) {
  mode = m;
  $$('input[name="mode"]').forEach((r) => { r.checked = r.value === m; });
  $('#plan').hidden = m !== 'workout';
  if (fromUser) {
    saveCfg();
    const keep = m === 'workout' && /w=/.test(location.hash) ? location.hash : `#mode=${m}`;
    history.replaceState(null, '', location.pathname + keep);
  }
  fillForm();
  build();
  noteFor();
}
$$('input[name="mode"]').forEach((r) => r.addEventListener('change', () => setMode(r.value, true)));

renderPlanList();
setMode(mode, false);
