# Issue #10: Expand Genre Analytics (Feature)

Summary:
This contribution expands genre analytics with bounded, validated backend API options for feature distributions and multi-genre comparisons, including SQL-aggregated bucket counts (`width_bucket`), track counts, and average audio metrics. Matching interactive charts and controls have been added to the Analytics Dashboard in the frontend, complete with loading, empty, and invalid UI states.
Link to issue: [Issue #10](https://github.com/Geektoberfest/Geektoberfest-Spotify-Integilligence/issues/10)

---

## Changed and Added Files

| Path | What changed | Why |
| --- | --- | --- |
| `backend/src/controllers/analyticsController.js` | Added `getGenreDistribution`, `compareGenres`, `getRankedGenres`, metric whitelist, and bounded limit handling in `getGenreList`. | Provide validated, SQL-aggregated distribution buckets and comparison data with bounded workloads. |
| `backend/src/routes/api.js` | Mounted `/analytics/genres/distribution`, `/analytics/genres/compare`, `/analytics/genres`, and alias routes before wildcard routes. | Expose genre analytics endpoints following Express REST routing conventions. |
| `backend/test/genreAnalytics.test.js` | Added integration tests covering distributions, comparisons, limits, bounds, and error states. | Verify all backend validation rules, SQL queries, and edge cases end-to-end. |
| `frontend/src/services/api.js` | Added `getGenreDistribution` and `compareGenres` API client helper methods. | Provide typed communication from the frontend application to backend analytics endpoints. |
| `frontend/src/components/GenreAnalytics.jsx` | Created modular brutalist Genre Analytics component with distribution histogram and grouped comparison bar chart. | Present matching interactive visual charts with explicit loading, empty, error, and invalid selection states. |
| `frontend/src/pages/MusicDashboard.jsx` | Integrated `GenreAnalytics` into the main analytics dashboard shell. | Display the feature distribution and multi-genre comparison views to end users. |
| `frontend/test/genreAnalytics.test.js` | Added unit tests for new `trackService` analytics API client functions. | Verify parameter encoding and HTTP query serialization on the client. |
| `README.md` | Documented query parameters for `/api/genres`, `/api/analytics/genres/distribution`, `/api/analytics/genres/compare`, and `/api/analytics/genres`. | Keep project documentation aligned with backend API contracts. |
| `ISSUE-10-CHANGES.md` | Created changes summary and verification document. | Fulfill open-source submission requirements. |

---

## Detailed Explanation of Modified/Added Units

### Backend

- **`ALLOWED_METRICS` (constant)**: Whitelist dictionary mapping valid audio feature names (`danceability`, `energy`, `valence`, `acousticness`, `speechiness`, `tempo`, `loudness`, `popularity`) to table column names, preventing SQL injection.
- **`exports.getGenreList`**: Lists unique genres with support for an optional bounded `limit` query parameter (capped at 50, returning 400 for invalid inputs).
- **`exports.getRankedGenres`**: Fetches top genres ranked by track count with pre-computed averages, bounded by a limit between 1 and 50 (default: 10).
- **`exports.getGenreDistribution`**: Validates `genre`, `metric`, and `bins` (2-20, default: 10); computes min/max via SQL and aggregates bucketed counts using PostgreSQL `width_bucket` without fetching rows into memory.
- **`exports.compareGenres`**: Validates 2-5 unique genres and up to 5 whitelisted metrics; runs a parameterized `LEFT JOIN` and `GROUP BY` query across `tracks` to return track counts and average metrics per genre.
- **`backend/src/routes/api.js`**: Registers routes for distribution, comparison, and ranked listings ahead of the parameterized `:genreName` route.

### Frontend

- **`trackService.getGenreDistribution`**: Makes a `GET /analytics/genres/distribution` request passing `genre`, `metric`, and `bins`.
- **`trackService.compareGenres`**: Makes a `GET /analytics/genres/compare` request converting arrays of genres and metrics into comma-separated strings.
- **`GenreAnalytics` component**: Renders two panels:
  - Feature Distribution: Genre dropdown, metric selector, bin count selector, Recharts `BarChart` histogram, and total track count meta badge.
  - Genre Comparison: Multi-genre selection chips with add/remove actions, metric toggle chips, Recharts grouped `BarChart`, and track count summaries.
- **`MusicDashboard` component**: Mounts `<GenreAnalytics genreOptions={genreOptions} />` within the dashboard layout.

---

## New API Parameters

### 1. `GET /api/analytics/genres/distribution`

| Parameter | Type | Default | Min / Max | Error Behavior |
| --- | --- | --- | --- | --- |
| `genre` | string | *required* | N/A | Missing or unknown genre returns `400 Bad Request`. Valid genre with zero tracks returns `200 OK` with `track_count: 0` and `bins: []`. |
| `metric` | string | *required* | Whitelisted: `danceability`, `energy`, `valence`, `acousticness`, `speechiness`, `tempo`, `loudness`, `popularity` | Missing or invalid metric returns `400 Bad Request`. |
| `bins` | integer | `10` | Min: `2`, Max: `20` | Non-integer, `< 2`, or `> 20` returns `400 Bad Request`. |

**Example Request**:
```http
GET /api/analytics/genres/distribution?genre=rock&metric=energy&bins=3 HTTP/1.1
```

**Example Response**:
```json
{
  "status": "success",
  "data": {
    "genre": "rock",
    "metric": "energy",
    "track_count": 732,
    "bins": [
      {
        "bin": 1,
        "bin_start": 0.0931,
        "bin_end": 0.3921,
        "label": "0.09 - 0.39",
        "count": 59
      },
      {
        "bin": 2,
        "bin_start": 0.3921,
        "bin_end": 0.691,
        "label": "0.39 - 0.69",
        "count": 308
      },
      {
        "bin": 3,
        "bin_start": 0.691,
        "bin_end": 0.99,
        "label": "0.69 - 0.99",
        "count": 365
      }
    ]
  }
}
```

### 2. `GET /api/analytics/genres/compare`

| Parameter | Type | Default | Min / Max | Error Behavior |
| --- | --- | --- | --- | --- |
| `genres` | string | *required* (comma-separated) | Min: `2`, Max: `5` unique genres | Missing, `< 2` unique genres, `> 5` genres, or unknown genre returns `400 Bad Request`. Duplicates are automatically deduplicated. |
| `metrics` | string | `danceability,energy,valence,acousticness,speechiness` | Max: `5` whitelisted metrics | Invalid metric or `> 5` metrics returns `400 Bad Request`. |

**Example Request**:
```http
GET /api/analytics/genres/compare?genres=pop,rock&metrics=energy,danceability HTTP/1.1
```

**Example Response**:
```json
{
  "status": "success",
  "data": [
    {
      "genre": "pop",
      "track_count": 658,
      "metrics": {
        "energy": 0.5855,
        "danceability": 0.6099
      }
    },
    {
      "genre": "rock",
      "track_count": 732,
      "metrics": {
        "energy": 0.6786,
        "danceability": 0.5425
      }
    }
  ]
}
```

### 3. `GET /api/genres`

| Parameter | Type | Default | Min / Max | Error Behavior |
| --- | --- | --- | --- | --- |
| `limit` | integer | all genres | Min: `1`, Max: `50` | Values `> 50` capped to 50; negative or non-integer returns `400 Bad Request`. |

---

## Validation and Edge Cases Handled

1. **SQL Injection Prevention**: User metric keys are validated against `ALLOWED_METRICS` object whitelist. Only mapped, hardcoded column identifiers are injected into queries; all other parameters (`$1`, `$2`, etc.) use parameterized values.
2. **NULL Audio Values**: SQL `AVG(...)` automatically excludes `NULL` values so averages are not skewed; `width_bucket` query filters `IS NOT NULL` so null values do not land in buckets.
3. **Valid Genre with 0 Tracks**: When a genre exists in `genre_analytics` but has 0 records in `tracks`, `getGenreDistribution` returns `200 OK` with `track_count: 0` and `bins: []`.
4. **Single Unique Value / Identical Min & Max**: When all tracks for a genre have the identical metric value, bucket calculation avoids zero-division and returns a single valid bucket.
5. **Deduplication of Comparison Genres**: Inputs like `genres=rock,rock,pop` are deduplicated into `['rock', 'pop']`. If the deduplicated count is `< 2` (e.g. `rock,rock`), `400 Bad Request` is returned.
6. **Selection Bounds in UI**:
   - The comparison genre selector disables adding beyond 5 genres and displays an inline notice.
   - When fewer than 2 genres are selected, an inline warning is shown and the API request is disabled (idle/invalid state), preventing invalid network requests.
   - Metric selectors disable adding beyond 5 metrics and preserve at least 1 selected metric.
   - Full loading, empty overlay ("No tracks for this selection"), and error states with Retry buttons are supported.

---

## How to Test

### 1. Automated Test Suites

```bash
# Backend unit & integration test suite
cd backend && npm test

# Genre analytics specific test suite
node --test backend/test/genreAnalytics.test.js

# Frontend unit tests, linting, and build validation
cd frontend && npm test
npm run lint
npm run build
```

### 2. Manual Verification Commands (cURL)

```bash
# Valid feature distribution
curl -s "http://127.0.0.1:5000/api/analytics/genres/distribution?genre=rock&metric=energy&bins=5"

# Validation errors: missing genre, bad metric, out-of-range bins
curl -s "http://127.0.0.1:5000/api/analytics/genres/distribution?metric=energy"
curl -s "http://127.0.0.1:5000/api/analytics/genres/distribution?genre=rock&metric=bad_metric"
curl -s "http://127.0.0.1:5000/api/analytics/genres/distribution?genre=rock&metric=energy&bins=30"

# Valid genre comparison
curl -s "http://127.0.0.1:5000/api/analytics/genres/compare?genres=rock,pop&metrics=energy,danceability"

# Comparison errors: < 2 genres, duplicate genres, > 5 genres, unknown genre
curl -s "http://127.0.0.1:5000/api/analytics/genres/compare?genres=rock"
curl -s "http://127.0.0.1:5000/api/analytics/genres/compare?genres=rock,rock"
curl -s "http://127.0.0.1:5000/api/analytics/genres/compare?genres=rock,pop,jazz,classical,metal,disco"
curl -s "http://127.0.0.1:5000/api/analytics/genres/compare?genres=rock,unknown_genre_foo"

# Bounded limit on genres
curl -s "http://127.0.0.1:5000/api/genres?limit=5"
curl -s "http://127.0.0.1:5000/api/analytics/genres?limit=10"
```

---

## Assumptions and Scope

- **Chart Library**: Reused existing `recharts` package already present in `frontend/package.json`; no new dependencies were added.
- **Database Schema**: No schema changes or migrations were required. Indexes `tracks_genre_idx` and `tracks_popularity_idx` already exist and efficiently serve the queries.
- **Automated Browser Subagent**: During local browser automation execution, Playwright binary installation failed due to external CDN download isolation in this environment. The frontend was therefore verified via Vite production build (`npm run build`), strict Oxlint inspection (`npm run lint`), and Node test runners.
