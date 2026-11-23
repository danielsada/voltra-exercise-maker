# Voltra Exercise Maker

🏋️ A hobby page for planning my own [Beyond Power VOLTRA I](https://www.beyond-power.com/) training: Tabata and
interval timers, and an exercise composer that only suggests what your Voltras, handles and anchor points allow.
Made with [Hugo](https://gohugo.io/), like [danielsada.tech](https://danielsada.tech).

**Live:** https://danielsada.github.io/voltra-exercise-maker/

> **Disclaimer.** This is a personal hobby project. It is not affiliated with, endorsed by or sponsored by Beyond
> Power, and VOLTRA is their trademark. Exercise names, cues and drawings are original to this site. Use the
> manufacturer's instructions for mounting and safety, and train within your limits.

## What's in it

| Page | What it does |
|---|---|
| **Composer** (`/composer/`) | You pick 1 or 2 Voltras, the Travel Platform, your handles and attachments, and your anchor points (pull-up bar, overhead, torso and feet height). It shows every exercise you can do and the setup to use, and composes a balanced workout you can send to the timer. |
| **Timer** (`/timer/`) | Tabata (20/10 × 8 by default), Interval (work, rest, rounds, sets) and Workout mode, which runs a composed workout one exercise at a time with an animated figure. It has beeps, vibration, on-device speech, keeps the screen awake and uses keyboard shortcuts (Space, ←, →, R). |
| **Equipment** (`/equipment/`) | How the site models anchors, the Travel Platform, attachments and Twin Mode, with sources, and what isn't confirmed. |

It makes no third-party requests and loads no web fonts. Settings are saved in your browser (`localStorage`), and
workouts and equipment setups can be shared as links (everything is in the URL hash).

## Running the project

Requires **Hugo 0.170.1** (any edition; the theme needs ≥ 0.158). Nothing else: the JavaScript is bundled by Hugo
itself (`js.Build`).

```sh
hugo server        # http://localhost:1313/voltra-exercise-maker/
hugo               # build into public/
```

The build checks `data/exercises.yaml` and fails with a clear message on a typo (unknown anchor, attachment or
pattern, duplicate id…).

## Deploy

GitHub Pages, from `main`, by `.github/workflows/pages.yml` (Settings → Pages → Source: **GitHub Actions**). The
workflow installs Hugo 0.170.1 and runs `hugo --minify`.

## Theme

The site uses **Breeze Plasma** ([hugo-breeze-plasma-inspired-theme](https://github.com/danielsada/hugo-breeze-plasma-inspired-theme)),
vendored as plain files in `themes/hugo-breeze-plasma-inspired-theme/`, with the same colours and logo as
danielsada.tech. To update it, replace that folder with a newer copy of the theme repository, without its repo-only
folders (`exampleSite/`, `docs/`, `images/`, `scripts/`, `.github/`). Don't edit the vendored theme; use its
configuration and extension points:

| What | Where |
|---|---|
| Identity, colours, menus, home widgets | `hugo.toml` |
| Home intro | `content/_index.md` |
| Home widgets (Start training, Hobby project) | `layouts/_partials/home/quickstart.html`, `disclaimer.html` |
| Timer and Composer pages | `content/*.md` with `params.view` → `layouts/_partials/views/{timer,composer}.html` |
| Page scripts | `params.script: <name>` → `assets/js/<name>-page.js` (bundled in `layouts/_partials/voltra/script.html`) |
| Footer disclaimer | `layouts/_partials/hooks/body-end.html` |
| Social preview image (made by Hugo from the logo) | `layouts/_partials/hooks/head-end.html` |
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
