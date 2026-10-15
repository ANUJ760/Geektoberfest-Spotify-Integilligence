const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/server');
const db = require('../src/config/db');

describe('GET /api/tracks - Sorting, Pagination & Validation', () => {
  let server;
  let baseUrl;

  // Test dataset with deliberate ties in popularity, name, and duration
  const testTracks = [
    {
      track_id: 'test_sort_01',
      track_name: 'Alpha Echo',
      artists: 'Test Artist A',
      album_name: 'Album A',
      track_genre: 'rock',
      popularity: 80,
      duration_ms: 180000,
      explicit: 0,
    },
    {
      track_id: 'test_sort_02',
      track_name: 'Bravo Beats',
      artists: 'Test Artist B',
      album_name: 'Album B',
      track_genre: 'rock',
      popularity: 95,
      duration_ms: 240000,
      explicit: 0,
    },
    {
      track_id: 'test_sort_03',
      track_name: 'Charlie Chord',
      artists: 'Test Artist C',
      album_name: 'Album C',
      track_genre: 'jazz',
      popularity: 80, // Same popularity as test_sort_01 (tests tie-breaker)
      duration_ms: 120000,
      explicit: 1,
    },
    {
      track_id: 'test_sort_04',
      track_name: 'Alpha Echo', // Same name as test_sort_01 (tests tie-breaker)
      artists: 'Test Artist D',
      album_name: 'Album D',
      track_genre: 'jazz',
      popularity: 60,
      duration_ms: 300000,
      explicit: 0,
    },
    {
      track_id: 'test_sort_05',
      track_name: 'Delta Drum',
      artists: 'Test Artist E',
      album_name: 'Album E',
      track_genre: 'pop',
      popularity: 40,
      duration_ms: 120000, // Same duration as test_sort_03 (tests tie-breaker)
      explicit: 1,
    },
  ];

  before(async () => {
    // Ensure database schema is ready
    await db.initializeSchema();

    // Clean up any stale test tracks
    await db.query(`DELETE FROM tracks WHERE track_id LIKE 'test_sort_%'`);

    // Insert test tracks
    for (const t of testTracks) {
      await db.query(
        `INSERT INTO tracks (track_id, track_name, artists, album_name, track_genre, popularity, duration_ms, explicit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [t.track_id, t.track_name, t.artists, t.album_name, t.track_genre, t.popularity, t.duration_ms, t.explicit]
      );
    }

    // Start ephemeral server
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api/tracks`;
        resolve();
      });
    });
  });

  after(async () => {
    // Clean up test data
    await db.query(`DELETE FROM tracks WHERE track_id LIKE 'test_sort_%'`);

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Default ordering (no sortBy): sorts by popularity DESC with track_id ASC tie-breaker', async () => {
    const res = await fetch(`${baseUrl}?search=Test%20Artist`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.data.length, 5);

    // Expected order by popularity DESC:
    // test_sort_02 (95)
    // test_sort_01 (80) [tie-breaker: test_sort_01 < test_sort_03]
    // test_sort_03 (80)
    // test_sort_04 (60)
    // test_sort_05 (40)
    const ids = body.data.map((t) => t.track_id);
    assert.deepEqual(ids, ['test_sort_02', 'test_sort_01', 'test_sort_03', 'test_sort_04', 'test_sort_05']);
  });

  test('2. Explicit sortBy=popularity: highest popularity first with tie-breaker', async () => {
    const res = await fetch(`${baseUrl}?search=Test%20Artist&sortBy=popularity`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    const ids = body.data.map((t) => t.track_id);
    assert.deepEqual(ids, ['test_sort_02', 'test_sort_01', 'test_sort_03', 'test_sort_04', 'test_sort_05']);
  });

  test('3. Explicit sortBy=name: alphabetical A-Z with tie-breaker', async () => {
    const res = await fetch(`${baseUrl}?search=Test%20Artist&sortBy=name`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    // Expected names:
    // Alpha Echo (test_sort_01) [tie-breaker: test_sort_01 < test_sort_04]
    // Alpha Echo (test_sort_04)
    // Bravo Beats (test_sort_02)
    // Charlie Chord (test_sort_03)
    // Delta Drum (test_sort_05)
    const ids = body.data.map((t) => t.track_id);
    assert.deepEqual(ids, ['test_sort_01', 'test_sort_04', 'test_sort_02', 'test_sort_03', 'test_sort_05']);
  });

  test('4. Explicit sortBy=duration: shortest duration first with tie-breaker', async () => {
    const res = await fetch(`${baseUrl}?search=Test%20Artist&sortBy=duration`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');

    // Expected durations:
    // 120000ms: test_sort_03 (120k) [tie-breaker: test_sort_03 < test_sort_05]
    // 120000ms: test_sort_05 (120k)
    // 180000ms: test_sort_01 (180k)
    // 240000ms: test_sort_02 (240k)
    // 300000ms: test_sort_04 (300k)
    const ids = body.data.map((t) => t.track_id);
    assert.deepEqual(ids, ['test_sort_03', 'test_sort_05', 'test_sort_01', 'test_sort_02', 'test_sort_04']);
  });

  test('5. Rejects unsupported sortBy with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}?sortBy=danceability`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /Invalid sortBy parameter/i);
    assert.match(body.message, /popularity, name, duration/);
  });

  test('6. Rejects SQL injection attempts in sortBy with 400 Bad Request', async () => {
    const malformed = 'popularity; DROP TABLE tracks; --';
    const res = await fetch(`${baseUrl}?sortBy=${encodeURIComponent(malformed)}`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /Invalid sortBy parameter/i);
  });

  test('7. Accepts case-insensitive and whitespace-padded valid sort keys', async () => {
    const res = await fetch(`${baseUrl}?search=Test%20Artist&sortBy=%20NAME%20`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    const ids = body.data.map((t) => t.track_id);
    assert.deepEqual(ids, ['test_sort_01', 'test_sort_04', 'test_sort_02', 'test_sort_03', 'test_sort_05']);
  });

  test('8. Deterministic pagination across pages when sorting with ties', async () => {
    // 5 tracks total, page size = 2
    // Full order by duration: [03, 05, 01, 02, 04]
    const page1Res = await fetch(`${baseUrl}?search=Test%20Artist&sortBy=duration&page=1&limit=2`);
    assert.equal(page1Res.status, 200);
    const page1 = await page1Res.json();
    assert.equal(page1.page, 1);
    assert.equal(page1.totalTracks, 5);
    assert.equal(page1.totalPages, 3);
    assert.deepEqual(page1.data.map((t) => t.track_id), ['test_sort_03', 'test_sort_05']);

    const page2Res = await fetch(`${baseUrl}?search=Test%20Artist&sortBy=duration&page=2&limit=2`);
    assert.equal(page2Res.status, 200);
    const page2 = await page2Res.json();
    assert.equal(page2.page, 2);
    assert.deepEqual(page2.data.map((t) => t.track_id), ['test_sort_01', 'test_sort_02']);

    const page3Res = await fetch(`${baseUrl}?search=Test%20Artist&sortBy=duration&page=3&limit=2`);
    assert.equal(page3Res.status, 200);
    const page3 = await page3Res.json();
    assert.equal(page3.page, 3);
    assert.deepEqual(page3.data.map((t) => t.track_id), ['test_sort_04']);
  });

  test('9. Sorting combined with genre and explicit filters', async () => {
    // Filter rock tracks sorted by popularity DESC
    const rockRes = await fetch(`${baseUrl}?search=Test%20Artist&genre=rock&sortBy=popularity`);
    assert.equal(rockRes.status, 200);
    const rockBody = await rockRes.json();
    const rockIds = rockBody.data.map((t) => t.track_id);
    assert.deepEqual(rockIds, ['test_sort_02', 'test_sort_01']);

    // Filter explicit tracks sorted by name A-Z
    const explicitRes = await fetch(`${baseUrl}?search=Test%20Artist&explicit=1&sortBy=name`);
    assert.equal(explicitRes.status, 200);
    const explicitBody = await explicitRes.json();
    const explicitIds = explicitBody.data.map((t) => t.track_id);
    // Explicit tracks are Charlie Chord (03) and Delta Drum (05)
    assert.deepEqual(explicitIds, ['test_sort_03', 'test_sort_05']);
  });
});
