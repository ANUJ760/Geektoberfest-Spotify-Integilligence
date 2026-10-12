import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import API, { trackService } from '../src/services/api.js';

describe('Frontend trackService - Sorting Integration', () => {
  let originalGet;

  before(() => {
    originalGet = API.get;
  });

  after(() => {
    API.get = originalGet;
  });

  test('1. trackService.getTracks sends sortBy parameter correctly', async () => {
    let capturedParams = null;
    let capturedUrl = null;

    API.get = async function (url, config) {
      capturedUrl = url;
      capturedParams = config?.params;
      return {
        data: {
          status: 'success',
          totalTracks: 1,
          page: 1,
          totalPages: 1,
          data: [{ track_id: 't1', track_name: 'Test Song', popularity: 80, duration_ms: 200000 }],
        },
      };
    };

    const res = await trackService.getTracks({
      page: 1,
      limit: 5,
      search: 'Test',
      genre: 'rock',
      sortBy: 'name',
    });

    assert.equal(capturedUrl, '/tracks');
    assert.deepEqual(capturedParams, {
      page: 1,
      limit: 5,
      search: 'Test',
      genre: 'rock',
      sortBy: 'name',
    });
    assert.equal(res.status, 'success');
    assert.equal(res.data[0].track_name, 'Test Song');
  });

  test('2. trackService.getTracks supports popularity and duration sort values', async () => {
    const sortOptions = ['popularity', 'duration'];

    for (const option of sortOptions) {
      let capturedOption = null;
      API.get = async function (url, config) {
        capturedOption = config?.params?.sortBy;
        return {
          data: { status: 'success', data: [] },
        };
      };

      await trackService.getTracks({ sortBy: option });
      assert.equal(capturedOption, option);
    }
  });

  test('3. Handles API error when invalid sortBy is rejected by backend', async () => {
    API.get = async function () {
      const err = new Error('Request failed with status code 400');
      err.response = {
        status: 400,
        data: {
          status: 'fail',
          message: 'Invalid sortBy parameter: "unknown". Allowed values are: popularity, name, duration.',
        },
      };
      throw err;
    };

    await assert.rejects(
      async () => {
        await trackService.getTracks({ sortBy: 'unknown' });
      },
      (err) => {
        assert.equal(err.response?.status, 400);
        assert.equal(err.response?.data?.status, 'fail');
        return true;
      }
    );
  });
});
