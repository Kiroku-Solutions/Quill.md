/**
 * Adversarial probe: serve a real HTTP origin locally, then probe IDB.
 * This mirrors what Vitest browser-mode does for the client project.
 */
import http from 'node:http';
import { chromium } from 'playwright';

const html = `<!DOCTYPE html><html><body><script>
window.__probe = (async () => {
  const out = { hasIDB: typeof indexedDB !== 'undefined', log: [], err: null };
  try {
    const dbName = '__probe_handle_store__';
    const storeName = 'probe';
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.addEventListener('upgradeneeded', () => {
        req.result.createObjectStore(storeName, { keyPath: 'id' });
      });
      req.addEventListener('success', () => { req.result.close(); resolve(); });
      req.addEventListener('error', () => reject(req.error));
    });
    out.log.push('open:ok');
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, 1);
      req.addEventListener('success', () => resolve(req.result));
      req.addEventListener('error', () => reject(req.error));
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put({ id: 'p1', name: 'probe-record', addedAt: Date.now() });
      tx.addEventListener('complete', () => resolve());
      tx.addEventListener('error', () => reject(tx.error));
    });
    out.log.push('put:ok');
    const got = await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const r = tx.objectStore(storeName).get('p1');
      r.addEventListener('success', () => resolve(r.result));
      r.addEventListener('error', () => reject(r.error));
    });
    out.log.push('get:' + (got && got.name === 'probe-record' ? 'ok' : 'fail'));
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.addEventListener('complete', () => resolve());
      tx.addEventListener('error', () => reject(tx.error));
    });
    out.log.push('clear:ok');
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.addEventListener('success', () => resolve());
      req.addEventListener('error', () => reject(req.error));
    });
    out.log.push('delete:ok');
    db.close();
  } catch (e) {
    out.err = String(e && e.stack ? e.stack : e);
  }
  return out;
})();
</script><body>probe loaded</body></html>`;

const server = http.createServer((req, res) => {
	res.writeHead(200, { 'Content-Type': 'text/html' });
	res.end(html);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(url);
const probe = await page.evaluate(() => window.__probe);
console.log(JSON.stringify(probe, null, 2));
await browser.close();
server.close();
