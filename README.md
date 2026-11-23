# Voltra Exercise Maker

🏋️ A hobby page for planning my own [Beyond Power VOLTRA I](https://www.beyond-power.com/) training: Tabata and
interval timers, and an exercise composer that only suggests what your Voltras, handles and anchor points allow.
Made with [Hugo](https://gohugo.io/), like [danielsada.tech](https://danielsada.tech).

**Live:** https://voltra.danielsada.tech/

> **Disclaimer.** This is a personal hobby project. It is not affiliated with, endorsed by or sponsored by Beyond
> Power, and VOLTRA is their trademark. Exercise names, cues and drawings are original to this site. Use the
> manufacturer's instructions for mounting and safety, and train within your limits.

## What's in it

| Page | What it does |
|---|---|
| **Composer** (home page, `/`) | You pick 1 or 2 Voltras, your anchor points (pull-up bar, overhead, torso and feet height, Travel Platform) and your handles and attachments. It lists every exercise you can do with the setup to use. Add exercises yourself or compose a balanced workout; the workout lives in the side panel (in the drawer on phones, opened by a floating bar) so it stays in view, and goes to the timer. |
| **Exercises** (`/exercises/`) | The whole library with no filters: every exercise and every way to set it up, with animated drawings. |
| **Timer** (`/timer/`) | Tabata (20/10 × 8 by default), Interval (work, rest, rounds, sets) and Workout mode, which runs a composed workout one exercise at a time with an animated figure. It has beeps, vibration, on-device speech, keeps the screen awake and uses keyboard shortcuts (Space, ←, →, R). |
| **Equipment** (`/equipment/`) | How the site models anchors, the Travel Platform, attachments and Twin Mode, with sources, and what isn't confirmed. |

It makes no third-party requests and loads no web fonts. Settings are saved in your browser (`localStorage`), and
workouts and equipment setups can be shared as links (everything is in the URL hash).

It's also an installable app (PWA): "Install app" appears in the side panel when the browser supports it (on iPhone:
Share → Add to Home Screen), and it works offline. Hugo makes the icons from the logo, the manifest and the service
worker (`layouts/_partials/voltra/pwa.html`, `assets/pwa/sw.js`); there's still nothing to install to build it.

## Running the project

Requires **Hugo 0.170.1** (any edition; the theme needs ≥ 0.158). Nothing else: the JavaScript is bundled by Hugo
itself (`js.Build`).

```sh
hugo server        # http://localhost:1313/
hugo               # build into public/
```

The build checks `data/exercises.yaml` and fails with a clear message on a typo (unknown anchor, attachment or
pattern, duplicate id…).

## Deploy

The site is deployed to **https://voltra.danielsada.tech/** by **Cloudflare Pages** from the `main` branch, the
same way as danielsada.tech:

| Setting | Value |
|---|---|
| Framework preset | Hugo |
| Build command | `hugo --minify` |
| Build output directory | `public` |
| Environment variable (Production and Preview) | `HUGO_VERSION` = `0.170.1` |
| Custom domain | `voltra.danielsada.tech` |

Keep `HUGO_VERSION` in the Pages settings in sync with the Hugo version you use locally (minimum 0.158). Preview
deployments build with the production `baseURL`, which is fine for checking a branch.

## Theme

The site uses **Breeze Plasma** ([hugo-breeze-plasma-inspired-theme](https://github.com/danielsada/hugo-breeze-plasma-inspired-theme)),
vendored as plain files in `themes/hugo-breeze-plasma-inspired-theme/`, with the same colours and logo as
danielsada.tech. To update it, replace that folder with a newer copy of the theme repository, without its repo-only
folders (`exampleSite/`, `docs/`, `images/`, `scripts/`, `.github/`). Don't edit the vendored theme; use its
configuration and extension points:

| What | Where |
|---|---|
| Identity, colours, menus | `hugo.toml` |
| Logo links to danielsada.tech | `params.homeurl` in `hugo.toml` (a theme setting) |
| Panel: Places and Elsewhere (the same as danielsada.tech), then this site's sections (`params.panel.sections`: `menus.voltra`, the composer's workout, `menus.guide`, Install app), as in side-project-template | `hugo.toml`, `layouts/_partials/breeze/panel-projects.html`, `layouts/_partials/voltra/panel-{workout,install}.html` |
| Home page = the composer (a home widget) | `[params.home]` in `hugo.toml`, `layouts/_partials/home/composer.html` |
| Redirects (old `/composer/` links) | `static/_redirects` |
| Composer, Timer and Exercises pages | `content/_index.md`, `content/*.md` with `params.view` → `layouts/_partials/views/{timer,composer,exercises}.html` |
| Page scripts | `params.script: <name>` → `assets/js/<name>-page.js` (bundled in `layouts/_partials/voltra/script.html`) |
| Footer disclaimer | `layouts/_partials/hooks/body-end.html` |
| JSON-LD (WebSite + Person on home, WebPage + BreadcrumbList elsewhere), social preview image, PWA tags | `layouts/_partials/hooks/head-end.html` |
| robots.txt (with the sitemap) | `layouts/robots.txt` |
| Extra CSS | `assets/css/custom.css` |
| Extra icons | `assets/breeze/icons/` |

## Editing exercises

Exercises live in `data/exercises.yaml`, and attachments and anchors live in `data/equipment.yaml`. Each exercise
lists `setups`, and it's possible when any one setup fits your equipment:

```yaml
- id: lat-pulldown
  name: Kneeling lat pulldown
  pattern: pull-vertical
  muscles: [lats, biceps, rear delts]
  cue: Kneel under the bar, chest proud; pull your elbows down to your ribs.
  setups:
    - { anchor: pullup, units: 1, attach: [bar1, functional-rope] }
    - { anchor: pullup, units: 2, attach: [handle], need: 2 }
  figure:
    view: front
    base: kneel
    tempo: 3
    poses:
      - { abduct: 162, elbow: 8 }
      - { abduct: 42, elbow: 128 }
```

The `figure` drives the stick-figure animation (`assets/js/lib/figure.js` documents the joint angles). The rig
(anchor, number of Voltras, attachment) comes from the setup, so the drawing matches your equipment.

## License

[GPL-3.0](LICENSE), same as danielsada.tech. The vendored theme is MIT (see its own `LICENSE`).
