// Equipment page: draws the setup diagrams ({{< diagrams >}} shortcode).
import * as P from '@params';
import { $$, anchorDemo, mountFigure } from './lib/ui.js';

for (const fig of $$('.diagram')) {
  const svg = anchorDemo(fig.dataset.anchor, Number(fig.dataset.units) || 1, P.exercises, P.equipment);
  if (svg) mountFigure(fig.querySelector('.diagram__fig'), svg);
}
