const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const cors = require('cors');

// Point DB to test database
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5434/spotify_intelligence';

const apiRoutes = require('../src/routes/api');
const db = require('../src/config/db');

describe('Audio Feature Recommendations API', () => {
  let server;
  let baseUrl;
  let sampleTrackId;

  before(async () => {
    // Pick a real track from DB to test with
    const trackRes = await db.query(
      'SELECT track_id, track_name, danceability, energy, valence, acousticness, tempo FROM tracks LIMIT 1'
    );
    if (trackRes.rows.length > 0) {
      sampleTrackId = trackRes.rows[0].track_id;
    }

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

  test('GET /api/recommendations with no params returns 400', async () => {
    const res = await fetch(`${baseUrl}/recommendations`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /Provide either track_id or target audio features/i);
  });

  test('GET /api/recommendations with target audio features returns ranked tracks', async () => {
    const params = new URLSearchParams({
      danceability: '0.7',
      energy: '0.8',
      valence: '0.6',
      acousticness: '0.2',
      tempo: '128',
      limit: '5',
    });
    const res = await fetch(`${baseUrl}/recommendations?${params}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 5);

    // Verify properties and descending match_score
    for (let i = 0; i < body.data.length; i++) {
      const track = body.data[i];
      assert.ok(track.track_id);
      assert.ok(typeof track.match_score === 'number');
      assert.ok(track.match_score >= 0 && track.match_score <= 100);
      if (i > 0) {
        assert.ok(body.data[i - 1].match_score >= track.match_score);
      }
    }
  });

  test('GET /api/recommendations with seed track_id excludes the seed track', async () => {
    assert.ok(sampleTrackId, 'Sample track ID must exist');
    const res = await fetch(`${baseUrl}/recommendations?track_id=${sampleTrackId}&limit=5`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.ok(body.seedTrack);
    assert.equal(body.seedTrack.track_id, sampleTrackId);
    assert.ok(Array.isArray(body.data));

    // Must not include the seed track itself in recommendations
    const includesSeed = body.data.some((t) => t.track_id === sampleTrackId);
    assert.equal(includesSeed, false);
  });

  test('GET /api/tracks/:id/recommendations returns recommendations for valid track', async () => {
    assert.ok(sampleTrackId, 'Sample track ID must exist');
    const res = await fetch(`${baseUrl}/tracks/${sampleTrackId}/recommendations?limit=3`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.data.length, 3);
    assert.equal(body.seedTrack.track_id, sampleTrackId);
  });

  test('GET /api/tracks/:id/recommendations returns 404 for unknown track', async () => {
    const res = await fetch(`${baseUrl}/tracks/nonexistent_track_id_99999/recommendations`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.status, 'fail');
    assert.match(body.message, /Seed track not found/i);
  });

  test('GET /api/recommendations filters by genre when specified', async () => {
    const genre = 'pop';
    const params = new URLSearchParams({
      danceability: '0.8',
      energy: '0.8',
      genre,
      limit: '5',
    });
    const res = await fetch(`${baseUrl}/recommendations?${params}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    for (const track of body.data) {
      assert.equal(track.track_genre, genre);
    }
  });

  test('GET /api/recommendations enforces limit bounds', async () => {
    const resOver = await fetch(`${baseUrl}/recommendations?danceability=0.5&limit=200`);
    assert.equal(resOver.status, 200);
    const bodyOver = await resOver.json();
    assert.ok(bodyOver.data.length <= 50);

    const resUnder = await fetch(`${baseUrl}/recommendations?danceability=0.5&limit=-5`);
    assert.equal(resUnder.status, 200);
    const bodyUnder = await resUnder.json();
    assert.equal(bodyUnder.data.length, 1);
  });
});
