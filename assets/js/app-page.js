// On every page: registers the service worker (offline + installable) and offers "Install app" in the panel.
import * as P from '@params';

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${P.base}sw.js`, { scope: P.base }).catch(() => {});
  });
}

const box = document.getElementById('install-box');
const btn = document.getElementById('install');
const ios = document.getElementById('install-ios');
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

if (box && !standalone) {
  let prompt = null;
  // Chrome, Edge, Android: the browser hands us its install prompt.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    prompt = e;
    box.hidden = false;
    btn.hidden = false;
  });
  btn.addEventListener('click', async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    box.hidden = true;
  });
  window.addEventListener('appinstalled', () => { box.hidden = true; });
  // iPhone and iPad Safari have no prompt: explain the Share menu instead.
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) {
    box.hidden = false;
    ios.hidden = false;
  }
}
