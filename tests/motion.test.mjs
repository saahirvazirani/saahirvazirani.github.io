import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const script = readFileSync(new URL('../site.js', import.meta.url), 'utf8');

function setup(reduced = false, hasCanvas = true) {
  let drawCount = 0;
  let pending = new Map();
  let id = 0;
  let intersection;
  const events = {};
  const preference = { matches: reduced, addEventListener: (_, fn) => { events.preference = fn; } };
  const button = { hidden: true, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, addEventListener: (_, fn) => { events.click = fn; } };
  const context = { clearRect: () => { drawCount++; }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setTransform() {} };
  const canvas = { getContext: () => context };
  const scene = { clientWidth: 500, clientHeight: 500, classList: { add() {} }, querySelector: s => s === 'canvas' ? canvas : button, addEventListener: (s, fn) => { events[s] = fn; } };
  const document = { hidden: false, querySelector: () => hasCanvas ? scene : null, querySelectorAll: () => [], addEventListener: (s, fn) => { events[s] = fn; } };
  runInNewContext(script, {
    window: { matchMedia: () => preference, devicePixelRatio: 3 }, document,
    performance: { now: () => 0 },
    requestAnimationFrame: fn => { pending.set(++id, fn); return id; },
    cancelAnimationFrame: key => pending.delete(key),
    ResizeObserver: class { observe() {} },
    IntersectionObserver: class { constructor(fn) { intersection = fn; } observe() {} },
  });
  return { button, canvas, events, document, count: () => drawCount, pending: () => pending.size,
    visible: value => intersection([{ isIntersecting: value }]),
    tick: time => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(fn => fn(time)); } };
}

test('canvas starts static offscreen and uses capped pixel density', () => {
  const app = setup();
  assert.equal(app.pending(), 0);
  assert.equal(app.canvas.width, 1000);
  assert.equal(app.count(), 1);
  assert.equal(app.button.hidden, false);
});

test('animation runs only onscreen; pause and background stop it', () => {
  const app = setup();
  app.visible(true);
  assert.equal(app.pending(), 1);
  app.tick(40);
  assert.equal(app.count(), 2);
  app.events.click();
  assert.equal(app.pending(), 0);
  assert.equal(app.button.textContent, 'Play animation');
  app.events.click();
  assert.equal(app.pending(), 1);
  app.document.hidden = true;
  app.events.visibilitychange();
  assert.equal(app.pending(), 0);
  app.document.hidden = false;
  app.events.visibilitychange();
  assert.equal(app.pending(), 1);
  app.visible(false);
  assert.equal(app.pending(), 0);
});

test('reduced motion is static by default and responds to preference changes', () => {
  const app = setup(true);
  app.visible(true);
  assert.equal(app.pending(), 0);
  assert.equal(app.button.textContent, 'Play animation');
  app.events.preference({ matches: false });
  assert.equal(app.pending(), 1);
  app.events.preference({ matches: true });
  assert.equal(app.pending(), 0);
});

test('writing page with no canvas initializes safely', () => {
  assert.doesNotThrow(() => setup(false, false));
});

test('navigation clears its current state after leaving a section', () => {
  const section = { id: 'research' };
  const attributes = {};
  const link = {
    hash: '#research',
    getAttribute: () => '#research',
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: key => { delete attributes[key]; },
  };
  let update;
  runInNewContext(script, {
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      querySelector: selector => selector === '#research' ? section : null,
      querySelectorAll: () => [link],
    },
    IntersectionObserver: class {
      constructor(callback) { update = callback; }
      observe() {}
    },
  });
  update([{ target: section, isIntersecting: true }]);
  assert.equal(attributes['aria-current'], 'location');
  update([{ target: section, isIntersecting: false }]);
  assert.equal(attributes['aria-current'], undefined);
});
