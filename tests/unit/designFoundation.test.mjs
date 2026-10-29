import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Stage 5.1 design foundation: semantic tokens and the shared primitives.
const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('\n}', css.indexOf(':root {')));

const TOKENS = [
  '--text-page-title-size', '--text-section-size', '--text-row-title-size', '--text-body-size',
  '--text-secondary-size', '--text-meta-size',
  '--color-text-primary', '--color-text-secondary', '--color-text-meta', '--color-text-disabled',
  '--color-surface-page', '--color-surface-object', '--color-divider', '--color-divider-strong',
  '--color-state-hover', '--color-state-active', '--color-state-selected', '--color-focus-ring',
  '--focus-ring-width', '--focus-ring-offset', '--space-section',
];

test('foundation tokens are declared on :root and resolve through base tokens', () => {
  for (const token of TOKENS) assert.match(rootBlock, new RegExp(`${token}:`), token);
  // Colour roles alias base tokens, so .dark needs no second definition.
  for (const token of TOKENS.filter((name) => name.startsWith('--color-'))) {
    assert.match(rootBlock, new RegExp(`${token}: var\\(--`), `${token} aliases a base token`);
  }
  assert.match(rootBlock, /--color-text-meta: var\(--color-label-secondary\)/, 'meta text stays readable');
});

test('every primitive has a visible keyboard focus rule', () => {
  const rule = css.slice(css.indexOf(':where(.gs-row, .gs-tab'), css.indexOf('}', css.indexOf(':where(.gs-row, .gs-tab')));
  for (const name of ['.gs-row', '.gs-tab', '.gs-button', '.gs-field__control', '.gs-table tr.is-interactive', '.gs-focusable']) {
    assert.ok(rule.includes(name), name);
  }
  assert.match(rule, /outline: var\(--focus-ring-width\) solid var\(--color-focus-ring\)/);
});

let server;
let ui;
before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: 'error',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true },
  });
  const load = async (name) => server.ssrLoadModule(`/src/components/ui/${name}.jsx`);
  ui = {
    Section: await load('Section'),
    Tabs: (await load('Tabs')).default,
    FormField: (await load('FormField')).default,
    ListRow: (await load('ListRow')).default,
    DataTable: (await load('DataTable')).default,
  };
});
after(async () => { await server?.close(); });

const render = (type, props, ...children) => renderToStaticMarkup(createElement(type, props, ...children));

test('Tabs mark the selected tab and keep only it in the tab order', () => {
  const html = render(ui.Tabs, {
    ariaLabel: 'Views',
    value: 'b',
    items: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C', disabled: true }],
  });
  assert.match(html, /role="tablist" aria-label="Views"/);
  assert.match(html, /aria-selected="true" tabindex="0"[^>]*class="season-tab gs-tab active">B</);
  assert.equal((html.match(/tabindex="-1"/g) ?? []).length, 2);
  assert.match(html, /disabled=""[^>]*>C</);
});

test('FormField ties its label, hint, and error to the control', () => {
  const ok = render(ui.FormField, { label: 'Email', hint: 'We send a link.' }, createElement('input', { type: 'email' }));
  const id = ok.match(/<input[^>]*id="([^"]+)"/)[1];
  assert.match(ok, new RegExp(`<label class="gs-field__label" for="${id}">Email</label>`));
  assert.match(ok, /class="gs-field__control"/);
  assert.match(ok, /aria-describedby="[^"]+-note"/);
  const bad = render(ui.FormField, { label: 'Email', error: 'Enter an email.' }, createElement('input'));
  assert.match(bad, /gs-field is-invalid/);
  assert.match(bad, /aria-invalid="true"/);
  assert.match(bad, /role="alert">Enter an email\./);
});

test('ListRow is a button with a chevron only when it is clickable', () => {
  const clickable = render(ui.ListRow, { title: 'Team', secondary: 'Manager', onClick() {} });
  assert.match(clickable, /^<button type="button" class="gs-row is-interactive"/);
  assert.match(clickable, /gs-row__chevron/);
  const plain = render(ui.ListRow, { title: 'Team' });
  assert.match(plain, /^<div class="gs-row"/);
  assert.equal(plain.includes('gs-row__chevron'), false);
});

test('Section and PageHeader render the text hierarchy without a box', () => {
  const page = render(ui.Section.PageHeader, { eyebrow: 'Live', title: 'Standings', description: 'Through week 7.' });
  assert.match(page, /<span class="gs-text-meta">Live<\/span><h1 class="gs-text-page-title">Standings<\/h1>/);
  const section = render(ui.Section.default, { title: 'League', meta: 'Seed at left', headingId: 'h' }, 'rows');
  assert.match(section, /<section class="gs-section" aria-labelledby="h">/);
  assert.match(section, /<h2 id="h" class="gs-text-section">League<\/h2>/);
  const table = render(ui.DataTable, { label: 'Standings' }, createElement('tbody'));
  assert.match(table, /<div class="gs-table-scroll"><table class="gs-table" aria-label="Standings">/);
});
