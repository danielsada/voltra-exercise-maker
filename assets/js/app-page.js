// On every page: registers the service worker (offline + installable) and offers "Install app".
// Chrome, Edge and Android hand us their install prompt. iPhone and iPad never prompt (Safari, and other iOS
// browsers, only install from Share → Add to Home Screen), so there we show a tip pointing at the Share button.
import * as P from '@params';

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${P.base}sw.js`, { scope: P.base }).catch(() => {});
  });
}

const box = document.getElementById('install-box');
const btn = document.getElementById('install');
const ios = document.getElementById('install-ios');
const tip = document.getElementById('ios-tip');
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const KEY = 'voltra:ios-tip'; // "dismissed" once closed; "force" shows it on any device (for testing)
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } };

const ua = navigator.userAgent;
const iPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const iOS = iPad || /iphone|ipod/i.test(ua) || read() === 'force';
const safari = !/crios|fxios|edgios|opios/i.test(ua); // Chrome/Firefox/Edge/Opera on iOS put Share in their own menu

// Keep the composer's floating workout bar above the tip.
const makeRoom = (on) => document.documentElement.style.setProperty('--tip-space', on ? `${tip.offsetHeight + 10}px` : '0px');

function showTip(focus) {
  if (!tip) return;
  tip.classList.toggle('ios-tip--top', iPad && safari); // iPad Safari's Share button is at the top right
  tip.querySelector('[data-where]').textContent = safari
    ? (iPad ? 'at the top right' : 'in the bar at the bottom')
    : 'in your browser’s menu';
  tip.hidden = false;
  makeRoom(true);
  if (focus) tip.querySelector('.ios-tip__close').focus();
}
function hideTip() {
  tip.hidden = true;
  makeRoom(false);
  write('dismissed');
}

if (box && !standalone) {
  let prompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    box.hidden = false;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (iOS && !prompt) {
      // close the phone drawer so the tip (and the Share button it points at) can be seen
      const close = document.querySelector('.panel.open [data-close]');
      if (close) close.click();
      showTip(true);
      return;
    }
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    box.hidden = true;
  });
  window.addEventListener('appinstalled', () => { box.hidden = true; });

  if (iOS && tip) {
    box.hidden = false;
    btn.hidden = false;
    ios.hidden = false;
    tip.querySelector('.ios-tip__close').addEventListener('click', hideTip);
    // Offer it once, a moment after the page settles, unless it was closed before or a workout is running.
    if (read() !== 'dismissed') {
      setTimeout(() => {
        if (!document.querySelector('.tm__stage:not([data-phase="idle"])')) showTip(false);
      }, 2500);
    }
  }
}
