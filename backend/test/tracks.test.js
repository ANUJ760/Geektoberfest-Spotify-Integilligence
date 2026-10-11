const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/server');

describe('GET /api/tracks - Pagination, Filter, and Validation Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('valid request returns 200 with default pagination', async () => {
    const res = await fetch(`${baseUrl}/api/tracks`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.page, 1);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length <= 20);
    assert.ok(typeof body.totalTracks === 'number');
  });

  test('valid request with custom page and limit', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?page=2&limit=5`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.page, 2);
    assert.ok(body.data.length <= 5);
  });

  test('caps limit to MAX_LIMIT (100) when a large limit is requested', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?limit=500`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.data.length <= 100);
  });

  test('rejects negative page with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?page=-1`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /page/i);
  });

  test('rejects page=0 with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?page=0`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /page/i);
  });

  test('rejects non-numeric page with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?page=invalid`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /page/i);
  });

  test('rejects fractional page with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?page=2.5`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /page/i);
  });

  test('rejects negative limit with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?limit=-5`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /limit/i);
  });

  test('rejects limit=0 with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?limit=0`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /limit/i);
  });

  test('rejects non-numeric limit with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?limit=foo`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /limit/i);
  });

  test('rejects fractional limit with 400', async () => {
    const res = await fetch(`${baseUrl}/api/tracks?limit=3.14`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /limit/i);
  });

  test('rejects invalid explicit parameter values with 400', async () => {
    const invalidValues = ['foo', '2', '-1', 'null', 'undefined', '100'];
    for (const val of invalidValues) {
      const res = await fetch(`${baseUrl}/api/tracks?explicit=${val}`);
      assert.equal(res.status, 400, `Expected 400 for explicit=${val}`);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /explicit/i);
    }
  });

  test('accepts valid explicit=0 and explicit=1', async () => {
    const resClean = await fetch(`${baseUrl}/api/tracks?explicit=0&limit=5`);
    assert.equal(resClean.status, 200);
    const cleanBody = await resClean.json();
    assert.equal(cleanBody.status, 'success');
    for (const track of cleanBody.data) {
      assert.equal(track.explicit, 0);
    }

    const resExplicit = await fetch(`${baseUrl}/api/tracks?explicit=1&limit=5`);
    assert.equal(resExplicit.status, 200);
    const explicitBody = await resExplicit.json();
    assert.equal(explicitBody.status, 'success');
    for (const track of explicitBody.data) {
      assert.equal(track.explicit, 1);
    }
  });

  test('accepts clean, explicit, true, false aliases for explicit query', async () => {
    for (const alias of ['clean', 'false']) {
      const res = await fetch(`${baseUrl}/api/tracks?explicit=${alias}&limit=5`);
      assert.equal(res.status, 200);
      const body = await res.json();
      for (const track of body.data) {
        assert.equal(track.explicit, 0);
      }
    }

    for (const alias of ['explicit', 'true']) {
      const res = await fetch(`${baseUrl}/api/tracks?explicit=${alias}&limit=5`);
      assert.equal(res.status, 200);
      const body = await res.json();
      for (const track of body.data) {
        assert.equal(track.explicit, 1);
      }
    }
  });

  test('GET /api/tracks/:id returns 404 for non-existent track ID', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/non_existent_id_9999`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.status, 'fail');
  });
});
