// Timestamp-based phase engine: elapsed time comes from the clock, not from counting ticks,
// so it never drifts and catches up after a throttled background tab. Pure (inject `now`).

export class Engine {
  constructor(phases, { now = () => performance.now(), onPhase = () => {} } = {}) {
    this.phases = phases;
    this.now = now;
    this.onPhase = onPhase;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.offset = 0; // ms into the current phase, as of `anchor`
    this.anchor = 0;
    this.running = false;
    this.done = this.phases.length <= 1;
  }

  get phase() {
    return this.phases[this.index];
  }

  elapsed() {
    return this.running ? this.offset + (this.now() - this.anchor) : this.offset;
  }

  start() {
    if (this.running || this.done) return;
    this.anchor = this.now();
    this.running = true;
  }

  pause() {
    if (!this.running) return;
    this.offset = this.elapsed();
    this.running = false;
  }

  toggle() {
    if (this.running) this.pause();
    else this.start();
  }

  go(index) {
    const last = this.phases.length - 1;
    this.index = Math.min(last, Math.max(0, index));
    this.offset = 0;
    this.anchor = this.now();
    if (this.index === last) {
      this.done = true;
      this.running = false;
    } else {
      this.done = false;
    }
    this.onPhase(this.index, this.phase);
  }

  skip() {
    if (!this.done) this.go(this.index + 1);
  }

  // Back: restart the current phase, or go to the previous one if it just started.
  back() {
    if (this.done) return this.go(this.phases.length - 2);
    if (this.elapsed() > 2000 || this.index === 0) return this.go(this.index);
    return this.go(this.index - 1);
  }

  // Advance through any phases whose time has passed. Returns a snapshot.
  update() {
    if (this.running) {
      let e = this.elapsed();
      while (!this.done && e >= this.phase.seconds * 1000) {
        e -= this.phase.seconds * 1000;
        const t = this.now();
        this.go(this.index + 1);
        this.offset = this.done ? 0 : e;
        this.anchor = t;
      }
    }
    return this.snapshot();
  }

  snapshot() {
    const p = this.phase;
    const elapsed = this.done ? 0 : Math.min(this.elapsed(), p.seconds * 1000);
    const remaining = this.done ? 0 : p.seconds * 1000 - elapsed;
    let before = 0;
    let total = 0;
    this.phases.forEach((ph, i) => {
      total += ph.seconds * 1000;
      if (i < this.index) before += ph.seconds * 1000;
    });
    const totalElapsed = this.done ? total : before + elapsed;
    return {
      index: this.index,
      phase: p,
      next: this.phases[this.index + 1] || null,
      elapsed,
      remaining,
      progress: p.seconds ? elapsed / (p.seconds * 1000) : 1,
      totalElapsed,
      totalRemaining: total - totalElapsed,
      running: this.running,
      done: this.done,
    };
  }
}
