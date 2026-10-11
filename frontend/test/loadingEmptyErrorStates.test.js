import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import API, { trackService } from '../src/services/api.js';

describe('Frontend Loading, Empty, and Error States (Issue #2)', () => {
  let originalGet;

  before(() => {
    originalGet = API.get;
  });

  after(() => {
    API.get = originalGet;
  });

  test('1. trackService.getGenres handles successful empty genre array (empty database)', async () => {
    API.get = async function (url) {
      if (url === '/genres') {
        return { data: [] };
      }
      return { data: {} };
    };

    const res = await trackService.getGenres();
    assert.deepEqual(res, []);
  });

  test('2. trackService.getGenres handles successful populated genres array', async () => {
    API.get = async function (url) {
      if (url === '/genres') {
        return { data: ['ambient', 'classical', 'electronic', 'rock'] };
      }
      return { data: {} };
    };

    const res = await trackService.getGenres();
    assert.deepEqual(res, ['ambient', 'classical', 'electronic', 'rock']);
    assert.equal(res.length, 4);
  });

  test('3. trackService.getGenres propagates API/database failure to allow error state and retry', async () => {
    API.get = async function () {
      const err = new Error('Database connection refused');
      err.response = { status: 500, data: { message: 'Database connection refused' } };
      throw err;
    };

    await assert.rejects(
      async () => {
        await trackService.getGenres();
      },
      (err) => {
        assert.equal(err.message, 'Database connection refused');
        return true;
      }
    );
  });

  test('4. trackService.getTracks returns empty results for filtered query', async () => {
    API.get = async function (url, config) {
      return {
        data: {
          status: 'success',
          totalTracks: 0,
          page: 1,
          totalPages: 0,
          data: [],
        },
      };
    };

    const res = await trackService.getTracks({ search: 'NonExistentArtist12345' });
    assert.equal(res.status, 'success');
    assert.equal(res.totalTracks, 0);
    assert.deepEqual(res.data, []);
  });

  test('5. trackService.getTracks propagates failure to trigger tracks error state and retry', async () => {
    API.get = async function () {
      const err = new Error('Network timeout');
      throw err;
    };

    await assert.rejects(
      async () => {
        await trackService.getTracks({ page: 1 });
      },
      (err) => {
        assert.equal(err.message, 'Network timeout');
        return true;
      }
    );
  });
});
