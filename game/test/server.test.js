const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer, resolve } = require('../server.js');

const ROOT = path.join(__dirname, '..');

test('the server only serves the game files', () => {
  assert.equal(resolve('/'), path.join(ROOT, 'index.html'));
  assert.equal(resolve('/js/vision.js'), path.join(ROOT, 'js', 'vision.js'));
  assert.equal(resolve('/js/vision.js?x=1'), path.join(ROOT, 'js', 'vision.js'));
  assert.equal(resolve('/../README.md'), null);
  assert.equal(resolve('/%2e%2e/%2e%2e/etc/passwd'), null);
  assert.equal(resolve('/server.js'), path.join(ROOT, 'server.js')); // a .js file, harmless to show
  assert.equal(resolve('/package.json'), null);
  assert.equal(resolve('/test/vision.test.js'), null);
  assert.equal(resolve('/.git/config'), null);
  assert.equal(resolve('/%E0%A4%A'), null);
});

test('the server answers with the page and refuses other methods', async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /<title>Freeze<\/title>/);
    const js = await fetch(base + '/js/shapes.js');
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(base + '/nope.html')).status, 404);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  } finally {
    server.close();
  }
});
