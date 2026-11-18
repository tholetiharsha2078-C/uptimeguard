#!/usr/bin/env node
/**
 * Captures documentation screenshots from the local dev server using
 * headless Google Chrome (no extra npm dependencies).
 *
 * Usage:
 *   UG_SESSION=<session token> node scripts/capture-screenshots.mjs
 *
 * The session token is the value of the `ug_session` cookie. You can read it
 * from the browser devtools (Application → Cookies) after signing in locally.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE_URL = process.env.UG_BASE_URL ?? 'http://127.0.0.1:5173';
const SESSION = process.env.UG_SESSION;
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = resolve(process.cwd(), 'docs/screenshots');
const PORT = 9333;

if (!SESSION) {
  console.error('Missing UG_SESSION (the ug_session cookie value).');
  process.exit(1);
}

const pages = [
  { name: 'dashboard', path: '/', waitFor: 'Overview' },
  { name: 'websites', path: '/websites', waitFor: 'monitored website' },
  { name: 'website-detail', path: '/websites/bda79dd1-47c4-4de0-bfa1-e373428690b9', waitFor: 'Uptime history' },
  { name: 'incidents', path: '/incidents', waitFor: 'Every downtime event' },
  { name: 'notifications', path: '/notifications', waitFor: 'Incident alerts' },
  { name: 'settings', path: '/settings', waitFor: 'Save profile' },
];

const profileDir = join(tmpdir(), `ug-chrome-${Date.now()}`);
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--window-size=1440,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function waitForDevtools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error('Chrome did not expose its DevTools endpoint.');
}

let nextId = 1;
const pending = new Map();
let socket;

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolveCall, rejectCall) => {
    pending.set(id, { resolve: resolveCall, reject: rejectCall });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function connect() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
  const target = await response.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, failed) => {
    socket.addEventListener('open', done, { once: true });
    socket.addEventListener('error', failed, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });
}

async function waitForText(text) {
  const script = `document.body.innerText.includes(${JSON.stringify(text)})`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const { result } = await send('Runtime.evaluate', { expression: script, returnByValue: true });
    if (result.value) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for page text: ${text}`);
}

async function main() {
  await waitForDevtools();
  await connect();
  await mkdir(OUT_DIR, { recursive: true });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await send('Network.setCookie', {
    name: 'ug_session',
    value: SESSION,
    url: BASE_URL,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });

  for (const page of pages) {
    await send('Page.navigate', { url: `${BASE_URL}${page.path}` });
    await waitForText(page.waitFor);
    await sleep(1200);
    const { cssContentSize } = await send('Page.getLayoutMetrics');
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
    });
    const file = join(OUT_DIR, `${page.name}.png`);
    await writeFile(file, Buffer.from(data, 'base64'));
    console.log(`saved ${file}`);
  }
}

try {
  await main();
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  await sleep(500);
  await rm(profileDir, { recursive: true, force: true });
}
