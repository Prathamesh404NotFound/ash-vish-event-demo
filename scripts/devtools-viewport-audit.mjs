import { writeFile } from 'node:fs/promises';

const CDP_HTTP = 'http://127.0.0.1:9222';
const APP_URL = 'http://localhost:3000';
const viewports = [
  { label: 'mobile-375', width: 375, height: 667, mobile: true },
  { label: 'tablet-768', width: 768, height: 1024, mobile: true },
  { label: 'laptop-1024', width: 1024, height: 768, mobile: false },
  { label: 'desktop-1440', width: 1440, height: 900, mobile: false },
];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openAuditTab() {
  const response = await fetch(`${CDP_HTTP}/json/new?${encodeURIComponent(`${APP_URL}/`)}`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Unable to open an audit tab: ${response.status}`);
  return response.json();
}

function createClient(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    const request = pending.get(payload.id);
    if (!request) return;
    pending.delete(payload.id);
    if (payload.error) request.reject(new Error(payload.error.message));
    else request.resolve(payload.result);
  });

  return {
    ready,
    command(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

const evaluate = async (client, expression) => {
  const result = await client.command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result.value;
};

const auditExpression = `(() => {
  const width = window.innerWidth;
  const offenders = [...document.querySelectorAll('body *')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.position !== 'fixed' && rect.width > 1 && rect.right > width + 1;
    })
    .slice(0, 6)
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      className: String(element.className || '').slice(0, 100),
      right: Math.round(element.getBoundingClientRect().right),
    }));

  return {
    title: document.title,
    innerWidth: width,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > width + 1 || document.body.scrollWidth > width + 1,
    offenders,
  };
})()`;

const auditTab = await openAuditTab();
const client = createClient(auditTab.webSocketDebuggerUrl);
await client.ready;
await client.command('Page.enable');
await client.command('Runtime.enable');

try {
  await wait(800);
  const routes = ['/', '/events', '/events/evt_001', '/login', '/organizer', '/checkout'];
  const results = [];

  for (const viewport of viewports) {
    await client.command('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });

    for (const route of routes) {
      await client.command('Page.navigate', { url: `${APP_URL}${route}` });
      await wait(900);
      const screenshotName =
        (viewport.label === 'mobile-375' && (route === '/' || route === '/events/evt_001')) ||
        (viewport.label === 'tablet-768' && route === '/events/evt_001') ||
        (viewport.label === 'desktop-1440' && route === '/')
          ? `/tmp/ash-vish-${viewport.label}-${route === '/' ? 'home' : 'event'}.png`
          : null;

      if (screenshotName) {
        const screenshot = await client.command('Page.captureScreenshot', { format: 'png' });
        await writeFile(screenshotName, Buffer.from(screenshot.data, 'base64'));
      }
      results.push({ viewport: viewport.label, route, ...(await evaluate(client, auditExpression)) });
    }
  }

  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter((result) => result.horizontalOverflow);
  process.exitCode = failures.length ? 2 : 0;
} finally {
  client.close();
}
