import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import API, { trackService } from '../src/services/api.js';

describe('Frontend trackService - Genre Analytics Integration', () => {
  let originalGet;

  before(() => {
    originalGet = API.get;
  });

  after(() => {
    API.get = originalGet;
  });

  test('1. trackService.getGenreDistribution sends genre, metric, and bins parameters', async () => {
    let capturedUrl = null;
    let capturedParams = null;

    API.get = async function (url, config) {
      capturedUrl = url;
      capturedParams = config?.params;
      return {
        data: {
          status: 'success',
          data: {
            genre: 'rock',
            metric: 'energy',
            track_count: 50,
            bins: [{ bin: 1, count: 5 }],
          },
        },
      };
    };

    const res = await trackService.getGenreDistribution('rock', 'energy', 10);

    assert.equal(capturedUrl, '/analytics/genres/distribution');
    assert.deepEqual(capturedParams, {
      genre: 'rock',
      metric: 'energy',
      bins: 10,
    });
    assert.equal(res.status, 'success');
    assert.equal(res.data.genre, 'rock');
    assert.equal(res.data.bins.length, 1);
  });

  test('2. trackService.compareGenres formats array params into comma-separated strings', async () => {
    let capturedUrl = null;
    let capturedParams = null;

    API.get = async function (url, config) {
      capturedUrl = url;
      capturedParams = config?.params;
      return {
        data: {
          status: 'success',
          data: [
            { genre: 'pop', track_count: 100, metrics: { energy: 0.6 } },
            { genre: 'rock', track_count: 120, metrics: { energy: 0.7 } },
          ],
        },
      };
    };

    const res = await trackService.compareGenres(['pop', 'rock'], ['energy', 'danceability']);

    assert.equal(capturedUrl, '/analytics/genres/compare');
    assert.deepEqual(capturedParams, {
      genres: 'pop,rock',
      metrics: 'energy,danceability',
    });
    assert.equal(res.status, 'success');
    assert.equal(res.data.length, 2);
  });

  test('3. trackService.getGenres forwards limit parameter when provided', async () => {
    let capturedParams = null;

    API.get = async function (url, config) {
      capturedParams = config?.params;
      return {
        data: {
          status: 'success',
          data: ['acoustic', 'afrobeat', 'alternative'],
        },
      };
    };

    const res = await trackService.getGenres(3);
    assert.deepEqual(capturedParams, { limit: 3 });
    assert.equal(res.data.length, 3);
  });
});
