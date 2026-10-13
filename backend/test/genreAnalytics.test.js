const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/server');
const db = require('../src/config/db');

describe('Genre Analytics Extended Feature Tests (Issue #10)', () => {
  let server;
  let baseUrl;
  let sampleGenre = 'rock';

  before(async () => {
    await db.initializeSchema();

    // Start ephemeral server
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Check if an existing genre is in database
    const gRes = await db.query('SELECT track_genre FROM genre_analytics LIMIT 1');
    if (gRes.rows.length > 0) {
      sampleGenre = gRes.rows[0].track_genre;
    }

    // Insert a test genre with zero tracks in tracks table to test 200 empty state
    await db.query(`DELETE FROM genre_analytics WHERE track_genre = 'test_empty_genre_zero_tracks'`);
    await db.query(`DELETE FROM tracks WHERE track_genre = 'test_empty_genre_zero_tracks'`);
    await db.query(`
      INSERT INTO genre_analytics (track_genre, avg_popularity, avg_danceability, avg_energy, avg_valence, track_count)
      VALUES ('test_empty_genre_zero_tracks', 0, 0, 0, 0, 0)
    `);
  });

  after(async () => {
    // Clean up test data
    await db.query(`DELETE FROM genre_analytics WHERE track_genre = 'test_empty_genre_zero_tracks'`);
    await db.query(`DELETE FROM tracks WHERE track_genre = 'test_empty_genre_zero_tracks'`);

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('1. Feature Distribution (/api/analytics/genres/distribution)', () => {
    test('valid distribution request returns 200 and bucketed SQL aggregation', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=energy&bins=10`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.genre, sampleGenre);
      assert.equal(body.data.metric, 'energy');
      assert.equal(typeof body.data.track_count, 'number');
      assert.ok(body.data.track_count > 0);
      assert.ok(Array.isArray(body.data.bins));
      assert.equal(body.data.bins.length, 10);

      // Verify each bin structure
      for (const bin of body.data.bins) {
        assert.ok('bin' in bin);
        assert.ok('bin_start' in bin);
        assert.ok('bin_end' in bin);
        assert.ok('label' in bin);
        assert.ok('count' in bin);
        assert.ok(typeof bin.count === 'number');
      }

      // Sum of counts should match track_count (or tracks with non-null energy)
      const sumCounts = body.data.bins.reduce((acc, b) => acc + b.count, 0);
      assert.ok(sumCounts <= body.data.track_count);
      assert.ok(sumCounts > 0);
    });

    test('valid distribution works with default bins (10)', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=danceability`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.bins.length, 10);
    });

    test('valid distribution works with custom min bins (2) and max bins (20)', async () => {
      const resMin = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=valence&bins=2`
      );
      assert.equal(resMin.status, 200);
      const bodyMin = await resMin.json();
      assert.equal(bodyMin.data.bins.length, 2);

      const resMax = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=valence&bins=20`
      );
      assert.equal(resMax.status, 200);
      const bodyMax = await resMax.json();
      assert.equal(bodyMax.data.bins.length, 20);
    });

    test('distribution works with alias route /api/analytics/distribution', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=tempo`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.metric, 'tempo');
    });

    test('valid genre with zero tracks returns 200 with empty bins and 0 track_count', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=test_empty_genre_zero_tracks&metric=energy`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.genre, 'test_empty_genre_zero_tracks');
      assert.equal(body.data.track_count, 0);
      assert.deepEqual(body.data.bins, []);
    });

    test('rejects missing genre with 400', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/genres/distribution?metric=energy`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /genre/i);
    });

    test('rejects non-existent genre with 400', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=imaginary_fantasy_genre_123&metric=energy`
      );
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /does not exist/i);
    });

    test('rejects missing metric with 400', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}`
      );
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /metric/i);
    });

    test('rejects invalid/non-whitelisted metric with 400', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=invalid_metric_foo`
      );
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /invalid metric/i);
    });

    test('rejects bins out of range or non-integer with 400', async () => {
      const resSmall = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=energy&bins=1`
      );
      assert.equal(resSmall.status, 400);

      const resLarge = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=energy&bins=25`
      );
      assert.equal(resLarge.status, 400);

      const resFloat = await fetch(
        `${baseUrl}/api/analytics/genres/distribution?genre=${encodeURIComponent(sampleGenre)}&metric=energy&bins=3.5`
      );
      assert.equal(resFloat.status, 400);
    });
  });

  describe('2. Genre Comparison (/api/analytics/genres/compare)', () => {
    test('valid comparison between 2 genres returns 200 with track_counts and average metrics', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/genres/compare?genres=pop,rock`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 2);

      for (const row of body.data) {
        assert.ok('genre' in row);
        assert.ok('track_count' in row);
        assert.equal(typeof row.track_count, 'number');
        assert.ok('metrics' in row);
        assert.ok('danceability' in row.metrics);
        assert.ok('energy' in row.metrics);
        assert.ok('valence' in row.metrics);
        assert.ok('acousticness' in row.metrics);
        assert.ok('speechiness' in row.metrics);
      }
    });

    test('comparison supports custom whitelist metrics and deduplicates genres', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/genres/compare?genres=pop,rock,pop&metrics=tempo,loudness`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.length, 2); // pop was deduplicated
      for (const row of body.data) {
        assert.ok('tempo' in row.metrics);
        assert.ok('loudness' in row.metrics);
        assert.equal(row.metrics.danceability, undefined);
      }
    });

    test('comparison works with alias route /api/analytics/compare', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/compare?genres=pop,rock`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
    });

    test('rejects fewer than 2 genres (or all duplicates) with 400', async () => {
      const resOne = await fetch(`${baseUrl}/api/analytics/genres/compare?genres=rock`);
      assert.equal(resOne.status, 400);
      const bodyOne = await resOne.json();
      assert.equal(bodyOne.status, 'fail');
      assert.match(bodyOne.message, /unique genres/i);

      const resDup = await fetch(`${baseUrl}/api/analytics/genres/compare?genres=rock,rock`);
      assert.equal(resDup.status, 400);
    });

    test('rejects more than 5 genres with 400', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/genres/compare?genres=rock,pop,jazz,classical,metal,disco`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /maximum of 5/i);
    });

    test('rejects non-existent genre in comparison with 400', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/genres/compare?genres=rock,unknown_genre_xyz_404`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /does not exist/i);
    });

    test('rejects invalid metric in comparison with 400', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/genres/compare?genres=rock,pop&metrics=not_a_metric`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /invalid metric/i);
    });

    test('rejects more than 5 metrics with 400', async () => {
      const res = await fetch(
        `${baseUrl}/api/analytics/genres/compare?genres=rock,pop&metrics=danceability,energy,valence,acousticness,speechiness,tempo`
      );
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /maximum of 5 metrics/i);
    });
  });

  describe('3. Track counts and Bounded Limits', () => {
    test('GET /api/genres supports bounded limit parameter', async () => {
      const res = await fetch(`${baseUrl}/api/genres?limit=5`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.length, 5);
    });

    test('GET /api/genres caps limit exceeding 50 to 50', async () => {
      const res = await fetch(`${baseUrl}/api/genres?limit=100`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.length, 50);
    });

    test('GET /api/genres rejects invalid limit with 400', async () => {
      const resZero = await fetch(`${baseUrl}/api/genres?limit=0`);
      assert.equal(resZero.status, 400);

      const resNeg = await fetch(`${baseUrl}/api/genres?limit=-5`);
      assert.equal(resNeg.status, 400);

      const resStr = await fetch(`${baseUrl}/api/genres?limit=abc`);
      assert.equal(resStr.status, 400);
    });

    test('GET /api/analytics/genres returns ranked genres with track_counts', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/genres?limit=8`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.length, 8);
      for (const row of body.data) {
        assert.ok('genre' in row);
        assert.ok('track_count' in row);
        assert.ok('avg_popularity' in row);
      }
    });
  });
});
