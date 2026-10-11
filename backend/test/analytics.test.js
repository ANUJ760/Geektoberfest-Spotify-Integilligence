const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cors = require('cors');

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5434/spotify_intelligence';

const apiRoutes = require('../src/routes/api');

describe('Expanded Genre Analytics API', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use('/api', apiRoutes);

    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}/api`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // Feature Distribution Tests
  describe('GET /api/analytics/distribution', () => {
    test('returns default tempo distribution with 10 bins and summary', async () => {
      const res = await fetch(`${baseUrl}/analytics/distribution`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.feature, 'tempo');
      assert.equal(body.binCount, 10);
      assert.equal(body.data.length, 10);
      assert.ok(body.totalTracks > 0);
      assert.ok(body.summary);
      assert.ok(typeof body.summary.avg_value === 'number');

      // Verify each bin shape
      for (const b of body.data) {
        assert.ok(typeof b.bin === 'number');
        assert.ok(b.label);
        assert.ok(typeof b.count === 'number');
        assert.ok(typeof b.percentage === 'number');
      }
    });

    test('supports danceability feature with bounded custom bins=5', async () => {
      const res = await fetch(`${baseUrl}/analytics/distribution?feature=danceability&bins=5`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.feature, 'danceability');
      assert.equal(body.binCount, 5);
      assert.equal(body.data.length, 5);
    });

    test('rejects invalid feature with 400 and helpful message', async () => {
      const res = await fetch(`${baseUrl}/analytics/distribution?feature=invalid_metric`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /Invalid feature/i);
    });

    test('rejects bins out of bounds (< 2 or > 25) with 400', async () => {
      const resUnder = await fetch(`${baseUrl}/analytics/distribution?bins=1`);
      assert.equal(resUnder.status, 400);
      const bodyUnder = await resUnder.json();
      assert.equal(bodyUnder.status, 'fail');
      assert.match(bodyUnder.message, /between 2 and 25/i);

      const resOver = await fetch(`${baseUrl}/analytics/distribution?bins=30`);
      assert.equal(resOver.status, 400);
      const bodyOver = await resOver.json();
      assert.equal(bodyOver.status, 'fail');
      assert.match(bodyOver.message, /between 2 and 25/i);
    });

    test('filters distribution by genre', async () => {
      const res = await fetch(`${baseUrl}/analytics/distribution?feature=energy&genre=pop&bins=6`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.genre, 'pop');
      assert.equal(body.data.length, 6);
      assert.ok(body.totalTracks > 0);
    });
  });

  // Genre Comparison Tests
  describe('GET /api/analytics/compare', () => {
    test('returns comparison metrics and track counts for requested genres', async () => {
      const res = await fetch(`${baseUrl}/analytics/compare?genres=pop,rock,classical`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.length, 3);

      for (const entry of body.data) {
        assert.ok(entry.genre);
        assert.ok(typeof entry.track_count === 'number' && entry.track_count > 0);
        assert.ok(typeof entry.popularity === 'number');
        assert.ok(typeof entry.danceability === 'number');
        assert.ok(typeof entry.energy === 'number');
      }
    });

    test('requires genres parameter with 400 error', async () => {
      const res = await fetch(`${baseUrl}/analytics/compare`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /Parameter "genres" is required/i);
    });

    test('rejects more than 6 genres with 400 error', async () => {
      const res = await fetch(
        `${baseUrl}/analytics/compare?genres=pop,rock,jazz,classical,hip-hop,dance,disco`
      );
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /Cannot compare more than 6 genres/i);
    });

    test('supports filtering selected metrics', async () => {
      const res = await fetch(
        `${baseUrl}/analytics/compare?genres=pop,rock&metrics=danceability,tempo,track_count`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      for (const entry of body.data) {
        assert.ok(entry.genre);
        assert.ok(typeof entry.track_count === 'number');
        assert.ok(typeof entry.danceability === 'number');
        assert.ok(typeof entry.tempo === 'number');
        // Unselected metric should not be present
        assert.equal(entry.loudness, undefined);
      }
    });

    test('rejects invalid metric with 400 error', async () => {
      const res = await fetch(`${baseUrl}/analytics/compare?genres=pop&metrics=unknown_metric`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /Invalid metric/i);
    });

    test('handles unknown genre gracefully and returns 404 if none found', async () => {
      const res = await fetch(`${baseUrl}/analytics/compare?genres=completely_fake_genre_xyz`);
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /None of the specified genres were found/i);
    });
  });

  // Global Dashboard Metrics Bounded Options Tests
  describe('GET /api/analytics/dashboard', () => {
    test('supports optional bounded top_genres_limit and sample_size', async () => {
      const res = await fetch(
        `${baseUrl}/analytics/dashboard?top_genres_limit=5&sample_size=100`
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'success');
      assert.equal(body.data.topGenres.length, 5);
      assert.equal(body.data.scatterSample.length, 100);
    });

    test('rejects out of bounds parameters with 400', async () => {
      const res = await fetch(`${baseUrl}/analytics/dashboard?top_genres_limit=50`);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.status, 'fail');
      assert.match(body.message, /top_genres_limit/i);
    });
  });
});
