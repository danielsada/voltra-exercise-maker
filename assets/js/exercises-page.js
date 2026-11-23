// Exercises page: draws each exercise; picking a setup redraws it with that rig.
import * as P from '@params';
import { $, $$, figureSVG, mountFigure } from './lib/ui.js';

const exById = new Map(P.exercises.map((e) => [e.id, e]));

for (const li of $$('.ex')) {
  const ex = exById.get(li.dataset.id);
  if (!ex) continue;
  const fig = $('.ex__fig', li);
  mountFigure(fig, figureSVG(ex, 0, P.equipment, { title: ex.name }));
  li.addEventListener('click', (e) => {
    const b = e.target.closest('.ex__pick');
    if (!b) return;
    const i = Number(b.dataset.setup);
    mountFigure(fig, figureSVG(ex, i, P.equipment, { title: ex.name }));
    $$('.ex__pick', li).forEach((x) => {
      const on = x === b;
      x.setAttribute('aria-pressed', String(on));
      x.parentElement.classList.toggle('is-best', on);
    });
  });
}
