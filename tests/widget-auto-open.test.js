import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoOpenController, shouldAutoOpen } from '../widget/src/auto-open.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
}

function fakeWindow({ pathname = '/', phone = false } = {}) {
  const listeners = new Map();
  const doc = {
    visibilityState: 'visible',
    body: { tagName: 'BODY' },
    activeElement: null,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
    fire: type => listeners.get(type)?.()
  };
  doc.activeElement = doc.body;
  return {
    document: doc,
    location: { pathname },
    sessionStorage: memoryStorage(),
    localStorage: memoryStorage(),
    matchMedia: () => ({ matches: phone })
  };
}

const CONFIG = {
  enabled: true,
  delayMs: 5000,
  mobile: 'bubble',
  teaser: 'Hi! Need help?',
  snoozeHours: 24,
  excludedPaths: ['/privacy', '/terms']
};

function controller(win, overrides = {}) {
  const calls = { open: 0, teaser: [] };
  let open = false;
  const ctrl = new AutoOpenController({
    config: CONFIG,
    win,
    isOpen: () => open,
    hasConversation: () => false,
    openPanel: () => { calls.open++; open = true; },
    showTeaser: text => calls.teaser.push(text),
    ...overrides
  });
  return { ctrl, calls, setOpen: value => { open = value; } };
}

test('shouldAutoOpen respects enablement, excluded paths, session, snooze, and conversations', () => {
  const base = { pathname: '/', now: 1_000, sessionStorage: memoryStorage(), localStorage: memoryStorage() };
  assert.equal(shouldAutoOpen(CONFIG, base), true);
  assert.equal(shouldAutoOpen({ ...CONFIG, enabled: false }, base), false);
  assert.equal(shouldAutoOpen(CONFIG, { ...base, pathname: '/privacy/' }), false);
  assert.equal(shouldAutoOpen(CONFIG, { ...base, hasConversation: true }), false);

  const shown = memoryStorage();
  shown.setItem('hirepool-assistant:auto-open:shown', '1');
  assert.equal(shouldAutoOpen(CONFIG, { ...base, sessionStorage: shown }), false);

  const snoozed = memoryStorage();
  snoozed.setItem('hirepool-assistant:auto-open:snoozed-until', '5000');
  assert.equal(shouldAutoOpen(CONFIG, { ...base, localStorage: snoozed }), false);
  assert.equal(shouldAutoOpen(CONFIG, { ...base, now: 6_000, localStorage: snoozed }), true);

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(shouldAutoOpen(CONFIG, { ...base, sessionStorage: broken, localStorage: broken }), true);
});

test('desktop: opens after 5 visible seconds, once per session', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const win = fakeWindow();
  const { ctrl, calls } = controller(win);
  assert.equal(ctrl.start(), true);
  t.mock.timers.tick(4999);
  assert.equal(calls.open, 0);
  t.mock.timers.tick(1);
  assert.equal(calls.open, 1);

  const second = controller(win);
  assert.equal(second.ctrl.start(), false, 'must not auto-open twice in one session');
});

test('time while the tab is hidden does not count', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const win = fakeWindow();
  const { ctrl, calls } = controller(win);
  ctrl.start();
  t.mock.timers.tick(3000);
  win.document.visibilityState = 'hidden';
  win.document.fire('visibilitychange');
  t.mock.timers.tick(60_000);
  assert.equal(calls.open, 0);
  win.document.visibilityState = 'visible';
  win.document.fire('visibilitychange');
  t.mock.timers.tick(1999);
  assert.equal(calls.open, 0);
  t.mock.timers.tick(1);
  assert.equal(calls.open, 1);
});

test('waits while the visitor is typing in a page form', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const win = fakeWindow();
  win.document.activeElement = { tagName: 'INPUT' };
  const { ctrl, calls } = controller(win);
  ctrl.start();
  t.mock.timers.tick(5000);
  assert.equal(calls.open, 0);
  win.document.activeElement = win.document.body;
  t.mock.timers.tick(2000);
  assert.equal(calls.open, 1);
});

test('phones get the greeting bubble instead of the full chat', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const win = fakeWindow({ phone: true });
  const { ctrl, calls } = controller(win);
  ctrl.start();
  t.mock.timers.tick(5000);
  assert.equal(calls.open, 0);
  assert.deepEqual(calls.teaser, ['Hi! Need help?']);
});

test('does not fire if the visitor already opened the chat, and snooze blocks later visits', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const win = fakeWindow();
  const { ctrl, calls, setOpen } = controller(win);
  ctrl.start();
  setOpen(true);
  t.mock.timers.tick(5000);
  assert.equal(calls.open, 0);

  ctrl.snooze();
  const freshSession = { ...win, sessionStorage: memoryStorage() };
  const later = controller(freshSession);
  assert.equal(later.ctrl.start(), false, 'snoozed for 24 hours after closing');
});

test('excluded pages never auto-open', () => {
  const { ctrl } = controller(fakeWindow({ pathname: '/terms' }));
  assert.equal(ctrl.start(), false);
});
