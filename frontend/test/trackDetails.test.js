import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import API, { trackService } from '../src/services/api.js';

describe('Frontend trackService - Track Details (Issue #3)', () => {
  let originalGet;

  before(() => {
    originalGet = API.get;
  });

  after(() => {
    API.get = originalGet;
  });

  test('1. trackService.getTrackById requests /tracks/:id with encoded ID', async () => {
    let capturedUrl = null;

    API.get = async function (url) {
      capturedUrl = url;
      return {
        data: {
          status: 'success',
          data: {
            track_id: 'test_123',
            track_name: 'Test Song',
            artists: 'Test Artist',
            album_name: 'Test Album',
            track_genre: 'pop',
            popularity: 85,
            duration_ms: 215000,
            explicit: 0,
            danceability: 0.75,
            energy: 0.82,
            valence: 0.65,
            acousticness: 0.12,
            instrumentalness: 0.0,
            tempo: 124.0,
          },
        },
      };
    };

    const res = await trackService.getTrackById('test_123');

    assert.equal(capturedUrl, '/tracks/test_123');
    assert.equal(res.status, 'success');
    assert.equal(res.data.track_id, 'test_123');
    assert.equal(res.data.album_name, 'Test Album');
    assert.equal(res.data.popularity, 85);
    assert.equal(res.data.duration_ms, 215000);
    assert.equal(res.data.danceability, 0.75);
    assert.equal(res.data.energy, 0.82);
    assert.equal(res.data.valence, 0.65);
    assert.equal(res.data.acousticness, 0.12);
    assert.equal(res.data.instrumentalness, 0.0);
    assert.equal(res.data.tempo, 124.0);
  });

  test('2. trackService.getTrackById encodes special characters in track ID', async () => {
    let capturedUrl = null;

    API.get = async function (url) {
      capturedUrl = url;
      return {
        data: {
          status: 'success',
          data: { track_id: 'abc/123#xyz?foo=bar' },
        },
      };
    };

    await trackService.getTrackById('abc/123#xyz?foo=bar');
    assert.equal(capturedUrl, `/tracks/${encodeURIComponent('abc/123#xyz?foo=bar')}`);
  });

  test('3. Handles 404 when track no longer exists in database', async () => {
    API.get = async function () {
      const err = new Error('Request failed with status code 404');
      err.response = {
        status: 404,
        data: {
          status: 'fail',
          message: 'Track not found',
        },
      };
      throw err;
    };

    await assert.rejects(
      async () => {
        await trackService.getTrackById('deleted_track_id');
      },
      (err) => {
        assert.equal(err.response?.status, 404);
        assert.equal(err.response?.data?.message, 'Track not found');
        return true;
      }
    );
  });

  test('4. Handles 500 server or network error gracefully', async () => {
    API.get = async function () {
      const err = new Error('Network Error');
      err.response = undefined;
      throw err;
    };

    await assert.rejects(
      async () => {
        await trackService.getTrackById('test_id');
      },
      (err) => {
        assert.equal(err.message, 'Network Error');
        return true;
      }
    );
  });

  test('5. Supports null or zero audio feature edge cases', async () => {
    API.get = async function () {
      return {
        data: {
          status: 'success',
          data: {
            track_id: 'edge_case_track',
            track_name: 'Ambient Noise',
            artists: 'Silent Group',
            album_name: null,
            track_genre: 'ambient',
            popularity: 0,
            duration_ms: 60000,
            danceability: 0,
            energy: 0,
            valence: null,
            acousticness: 0.99,
            instrumentalness: 0.95,
            tempo: 60.5,
          },
        },
      };
    };

    const res = await trackService.getTrackById('edge_case_track');
    assert.equal(res.data.popularity, 0);
    assert.equal(res.data.album_name, null);
    assert.equal(res.data.danceability, 0);
    assert.equal(res.data.valence, null);
  });
});
