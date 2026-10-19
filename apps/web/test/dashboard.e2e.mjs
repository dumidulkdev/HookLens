import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { config } from 'dotenv';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const directory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(directory, '../../../.env'), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
assert(
  testUrl && new URL(testUrl).pathname.endsWith('_test'),
  'Set TEST_DATABASE_URL to a dedicated _test database',
);
assert.notEqual(testUrl, process.env.DATABASE_URL, 'The test database must be separate');
process.env.DATABASE_URL = testUrl;
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
process.env.CREATE_RATE_LIMIT = '1000';
process.env.CAPTURE_RATE_LIMIT = '1000';

const require = createRequire(import.meta.url);
const { createApp } = require('../../api/dist/create-app.js');
const app = await createApp(false);
await app.listen(0, '127.0.0.1');
const apiUrl = await app.getUrl();
process.env.VITE_API_URL = apiUrl;
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  sessionStorage: dom.window.sessionStorage,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
const vite = await createServer({
  root: resolve(directory, '..'),
  server: { middlewareMode: true },
  appType: 'custom',
});
let root;
let endpoint;

async function waitFor(check, label) {
  for (let attempt = 0; attempt < 160; attempt++) {
    if (check()) return;
    await act(async () => {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    });
  }
  throw new Error(`Dashboard check timed out: ${label}`);
}
async function click(selector) {
  const element = document.querySelector(selector);
  assert(element, `Missing control: ${selector}`);
  await act(async () => {
    element.click();
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  });
}

async function deliver(path, options) {
  await act(async () => {
    assert.equal((await fetch(`${apiUrl}${path}`, options)).status, 200);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  });
}

try {
  const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(App)));
  assert(document.body.textContent.includes('Generate webhook'));
  await click('.page-heading .primary');
  await waitFor(
    () => document.querySelector('.connection')?.textContent.includes('Live'),
    'authorized live connection',
  );
  endpoint = JSON.parse(sessionStorage.getItem('hooklens.endpoint'));
  assert(endpoint?.id && endpoint.managementToken);
  assert.equal(dom.window.localStorage.length, 0);
  assert(!dom.window.location.href.includes(endpoint.managementToken));
  assert(!document.body.textContent.includes(endpoint.managementToken));
  const capturePath = new URL(endpoint.webhookUrl).pathname;
  const payload = {
    event: 'qa.delivery',
    html: '<img src="https://invalid.example" onerror="alert(1)">',
  };
  await deliver(`${capturePath}?source=dashboard-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await waitFor(
    () =>
      document.querySelectorAll('.request-item').length === 1 &&
      document.querySelector('.detail-title'),
    'live capture and auto-selection',
  );
  await click('[role="tab"]:last-child');
  await waitFor(
    () => document.querySelector('.body-code')?.textContent.includes('qa.delivery'),
    'formatted body',
  );
  assert.equal(
    document.querySelector('.body-code img'),
    null,
    'Captured HTML must remain inert text',
  );
  await click('[role="tab"]:nth-child(3)');
  assert(document.querySelector('[role="tabpanel"]').textContent.includes('dashboard-test'));
  await click('[role="tab"]:nth-child(2)');
  assert(document.querySelector('[role="tabpanel"]').textContent.includes('application/json'));

  await act(async () => root.unmount());
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(App)));
  await waitFor(
    () =>
      document.querySelector('.connection')?.textContent.includes('Live') &&
      document.querySelectorAll('.request-item').length === 1,
    'session restoration',
  );
  await deliver(capturePath, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array([255, 0, 128]),
  });
  await waitFor(
    () => document.querySelectorAll('.request-item').length === 2,
    'second live capture',
  );
  await click('.request-item[aria-label^="PUT"]');
  await waitFor(
    () => document.querySelector('.detail-title .method')?.textContent === 'PUT',
    'binary selection',
  );
  await click('[role="tab"]:last-child');
  assert(document.querySelector('.body-code').textContent.includes('/wCA'));
  await click('[aria-label="Clear request history"]');
  await waitFor(
    () =>
      document.querySelectorAll('.request-item').length === 0 &&
      document.querySelector('.list-empty'),
    'clear history',
  );
  assert(!document.querySelector('[role="alert"]'), 'No unexpected UI error');
  console.log(
    'Dashboard integration passed: generation, live capture, inspection, inert HTML, binary Base64, session restoration, and clearing against PostgreSQL.',
  );
} finally {
  if (root) await act(async () => root.unmount());
  if (!endpoint) {
    const stored = sessionStorage.getItem('hooklens.endpoint');
    if (stored) endpoint = JSON.parse(stored);
  }
  if (endpoint)
    await fetch(`${apiUrl}/api/endpoints/${endpoint.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${endpoint.managementToken}` },
    });
  await vite.close();
  await app.close();
  dom.window.close();
}
