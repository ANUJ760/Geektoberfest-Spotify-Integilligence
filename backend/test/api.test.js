const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/server');
const db = require('../src/config/db');

describe('Backend API Coverage Suite', () => {
  let server;
  let baseUrl;
  let sampleTrackId;
  let sampleGenre;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Retrieve a sample track and genre from database for realistic testing
    const trackRes = await db.query('SELECT track_id, track_genre FROM tracks LIMIT 1');
    if (trackRes.rows.length > 0) {
      sampleTrackId = trackRes.rows[0].track_id;
      sampleGenre = trackRes.rows[0].track_genre;
    }
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await db.pool.end();
  });

  describe('Health and System Endpoints', () => {
    test('GET / returns 200 welcome message', async () => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.match(data.message, /Spotify Music Intelligence API/i);
      assert.ok(data.timestamp);
    });

    test('GET /health returns 200 healthy status', async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'healthy');
    });
  });

  describe('Tracks Pagination and Response Shapes', () => {
    test('GET /api/tracks returns default pagination shape', async () => {
      const res = await fetch(`${baseUrl}/api/tracks`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.status, 'success');
      assert.equal(typeof data.totalTracks, 'number');
      assert.equal(data.page, 1);
      assert.equal(typeof data.totalPages, 'number');
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length <= 20);

      if (data.data.length > 0) {
        const track = data.data[0];
        assert.ok('track_id' in track);
        assert.ok('track_name' in track);
        assert.ok('artists' in track);
        assert.ok('popularity' in track);
        assert.ok('explicit' in track);
      }
    });

    test('GET /api/tracks respects page and limit pagination parameters', async () => {
      const res1 = await fetch(`${baseUrl}/api/tracks?page=1&limit=3`);
      const res2 = await fetch(`${baseUrl}/api/tracks?page=2&limit=3`);

      assert.equal(res1.status, 200);
      assert.equal(res2.status, 200);

      const data1 = await res1.json();
      const data2 = await res2.json();

      assert.equal(data1.page, 1);
      assert.equal(data2.page, 2);
      assert.ok(data1.data.length <= 3);
      assert.ok(data2.data.length <= 3);

      if (data1.data.length > 0 && data2.data.length > 0) {
        // Track IDs across separate pages should not overlap
        const ids1 = new Set(data1.data.map((t) => t.track_id));
        const hasOverlap = data2.data.some((t) => ids1.has(t.track_id));
        assert.equal(hasOverlap, false, 'Pages should return distinct tracks');
      }
    });
  });

  describe('Tracks Filtering', () => {
    test('GET /api/tracks filters by search query matching track_name or artist', async () => {
      // Pick artist from existing data or search common term
      const res = await fetch(`${baseUrl}/api/tracks?search=love&limit=5`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      for (const track of data.data) {
        const matches =
          track.track_name.toLowerCase().includes('love') ||
          track.artists.toLowerCase().includes('love');
        assert.ok(matches, `Track ${track.track_name} by ${track.artists} should match 'love'`);
      }
    });

    test('GET /api/tracks filters by genre', async () => {
      if (!sampleGenre) return;
      const res = await fetch(`${baseUrl}/api/tracks?genre=${encodeURIComponent(sampleGenre)}&limit=10`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      for (const track of data.data) {
        assert.equal(track.track_genre, sampleGenre);
      }
    });

    test('GET /api/tracks filters by explicit flag', async () => {
      const resClean = await fetch(`${baseUrl}/api/tracks?explicit=0&limit=5`);
      assert.equal(resClean.status, 200);
      const cleanData = await resClean.json();
      for (const track of cleanData.data) {
        assert.equal(track.explicit, 0);
      }

      const resExplicit = await fetch(`${baseUrl}/api/tracks?explicit=1&limit=5`);
      assert.equal(resExplicit.status, 200);
      const explicitData = await resExplicit.json();
      for (const track of explicitData.data) {
        assert.equal(track.explicit, 1);
      }
    });

    test('GET /api/tracks combines search, genre, and explicit filters', async () => {
      if (!sampleGenre) return;
      const res = await fetch(
        `${baseUrl}/api/tracks?genre=${encodeURIComponent(sampleGenre)}&explicit=0&limit=5`
      );
      assert.equal(res.status, 200);
      const data = await res.json();
      for (const track of data.data) {
        assert.equal(track.track_genre, sampleGenre);
        assert.equal(track.explicit, 0);
      }
    });
  });

  describe('Track Lookup by ID', () => {
    test('GET /api/tracks/:id returns 200 and track details for known ID', async () => {
      if (!sampleTrackId) return;
      const res = await fetch(`${baseUrl}/api/tracks/${sampleTrackId}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.track_id, sampleTrackId);
      assert.ok('track_name' in data.data);
      assert.ok('artists' in data.data);
      assert.ok('album_name' in data.data);
      assert.ok('duration_ms' in data.data);
      assert.ok('popularity' in data.data);
      assert.ok('danceability' in data.data);
      assert.ok('energy' in data.data);
      assert.ok('valence' in data.data);
    });

    test('GET /api/tracks/:id returns 404 for unknown track ID', async () => {
      const res = await fetch(`${baseUrl}/api/tracks/non_existent_track_xyz_999`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.status, 'fail');
      assert.match(data.message, /not found/i);
    });
  });

  describe('Genre Analytics Endpoints', () => {
    test('GET /api/genres returns list of unique genres sorted alphabetically', async () => {
      const res = await fetch(`${baseUrl}/api/genres`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.ok(Array.isArray(data.data));
      assert.ok(data.data.length > 0);

      // Verify each item is a string
      assert.equal(typeof data.data[0], 'string');

      // Verify ascending alphabetical order
      for (let i = 1; i < data.data.length; i++) {
        assert.ok(
          data.data[i - 1].localeCompare(data.data[i]) <= 0,
          `Genres should be ordered alphabetically: ${data.data[i - 1]} vs ${data.data[i]}`
        );
      }
    });

    test('GET /api/analytics/genres/:genreName returns computed metrics for valid genre', async () => {
      if (!sampleGenre) return;
      const res = await fetch(`${baseUrl}/api/analytics/genres/${encodeURIComponent(sampleGenre)}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.track_genre, sampleGenre);

      // Verify DNA metrics shape
      const requiredMetrics = [
        'avg_popularity',
        'avg_danceability',
        'avg_energy',
        'avg_valence',
        'avg_acousticness',
        'avg_instrumentalness',
        'avg_speechiness',
        'avg_tempo',
        'track_count',
      ];
      for (const metric of requiredMetrics) {
        assert.ok(metric in data.data, `Missing metric: ${metric}`);
        assert.ok(typeof Number(data.data[metric]) === 'number');
      }
    });

    test('GET /api/analytics/genres/:genreName returns 404 for invalid genre', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/genres/unknown_fantasy_genre_12345`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.status, 'fail');
      assert.match(data.message, /not found/i);
    });
  });

  describe('Global Dashboard Analytics Endpoints', () => {
    test('GET /api/analytics/dashboard returns tempoDistribution, topGenres, and scatterSample', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/dashboard`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.status, 'success');
      assert.ok(data.data, 'Response should contain data object');

      // 1. Check tempoDistribution shape
      assert.ok(Array.isArray(data.data.tempoDistribution));
      assert.ok(data.data.tempoDistribution.length > 0);
      for (const bin of data.data.tempoDistribution) {
        assert.ok('tempo_bin' in bin);
        assert.ok('track_count' in bin);
        assert.ok(Number(bin.track_count) >= 0);
      }

      // 2. Check topGenres shape (limited to 8)
      assert.ok(Array.isArray(data.data.topGenres));
      assert.ok(data.data.topGenres.length <= 8);
      for (const item of data.data.topGenres) {
        assert.ok('genre' in item);
        assert.ok('avg_popularity' in item);
        assert.ok('avg_energy' in item);
        assert.ok('avg_danceability' in item);
        assert.ok('avg_valence' in item);
      }

      // 3. Check scatterSample shape (limited to 300, popularity > 10)
      assert.ok(Array.isArray(data.data.scatterSample));
      assert.ok(data.data.scatterSample.length <= 300);
      for (const track of data.data.scatterSample) {
        assert.ok('track_name' in track);
        assert.ok('artists' in track);
        assert.ok('popularity' in track);
        assert.ok('energy' in track);
        assert.ok('danceability' in track);
        assert.ok(track.popularity > 10, 'Scatter plot tracks should have popularity > 10');
      }
    });
  });
});
