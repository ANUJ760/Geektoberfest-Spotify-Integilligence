# Spotify Music Intelligence

A full-stack music discovery and analytics app. The backend serves track search and genre analytics from PostgreSQL, while the React frontend provides a Music Explorer and an Analytics Dashboard.

## Participant tasks

Issues and feature ideas are grouped by estimated effort. Difficulty is only a guide; contributors can choose any task. For bug fixes, include steps to reproduce and describe the expected behavior in the pull request. For features, include a short usage example or screenshot where useful.

### Easy

- **Fix dashboard analytics response keys (bug):** The dashboard reads `tempoDistribution` and `scatterSample`, but `/api/analytics/dashboard` currently returns `tempoDisribution` and `scattersample`. Align the API response with the frontend (or update both consistently) so the tempo and scatter charts display data.
- **Validate track pagination and filters (bug):** `/api/tracks` accepts invalid, negative, or excessively large `page` and `limit` values, and parses `explicit` without checking that it is `0` or `1`. Validate query parameters, return a clear `400` response for invalid values, and set a documented maximum page size.
- **Unify database setup defaults (bug):** The Node database config defaults to the misspelled user `posgres`, while the Python pipeline defaults to `postgres`. Use consistent configuration and document the required environment variables so both services connect to the same database.
- **Improve empty and failure states:** Show a useful retry action when genre loading fails in the Explorer, and distinguish an empty search result from an API/database error.
- **Fix data pipeline cleanup:** `clean_data.py` renames `tracks_genre`, but the aggregated column is named `track_genre`. Correct the rename or remove it, and remove duplicate success logging.

### Medium

- **Add explicit-content filtering to the Explorer:** The backend already supports an `explicit` query parameter, but the UI does not expose it. Add an all / explicit / clean filter and reset pagination when it changes.
- **Add sorting options:** Let users order tracks by popularity, name, or duration. Validate supported sort fields server-side and keep ordering deterministic when values tie.
- **Add track detail view:** Use the existing `GET /api/tracks/:id` endpoint to show album, duration, popularity, and audio features when a track is selected.
- **Improve API error handling:** Add a consistent `404` response for unknown API routes, handle malformed JSON and database errors with useful client-safe messages, and avoid exposing stack traces or credentials.
- **Make analytics sample reproducible:** The dashboard scatter query uses `ORDER BY RANDOM()`, so each refresh changes the sample and may be slow on a large table. Add a stable or seeded sample strategy and compare query cost.
- **Add automated coverage:** Cover track filtering, pagination validation, missing track IDs, genre analytics, and dashboard response shape. Include a documented command for running backend checks.

### Hard

- **Build audio-feature recommendations:** Add an endpoint that finds tracks similar to a selected track or target feature profile using danceability, energy, valence, acousticness, and tempo. Define a distance/scoring method, handle missing values, and add UI controls to explore recommendations.
- **Add playlist and export tools:** Allow users to collect tracks into a temporary playlist and export selections as CSV. Preserve selected tracks while navigating search results and handle duplicate tracks.
- **Scale analytics queries:** Add appropriate PostgreSQL indexes, inspect query plans for search and dashboard endpoints, and replace expensive full-table/random scans with efficient alternatives. Document performance before and after.
- **Make the data pipeline safe to rerun:** Replace destructive table replacement with a versioned or transactional import/upsert workflow, add schema constraints and indexes, and ensure the tracks and genre analytics tables update together if a load fails.
- **Add a richer analytics exploration API:** Support configurable feature distributions and genre comparisons (including track counts and selected audio metrics), with bounded parameters and response sizes. Add matching interactive charts to the dashboard.
- **Add database-independent local development:** Provide a Docker Compose setup or equivalent reproducible environment for PostgreSQL, backend, and frontend, plus seed/import instructions that work from a clean checkout.

## Project structure

```text
backend/          Express API and PostgreSQL queries
frontend/         React + Vite application
Data/raw/         Source Spotify tracks dataset
Data_processing/  CSV cleaning and database import pipeline
```

## Getting started

The backend expects PostgreSQL and reads `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, and `DB_NAME` from environment variables. Set `VITE_API_URL` in the frontend if the API is not running at `http://localhost:5000/api`.

- Backend: `cd backend && npm install && npm start`
- Frontend: `cd frontend && npm install && npm run dev`
- Data import dependencies: `pip install -r Data_processing/requirements.txt`, then run `python Data_processing/clean_data.py` from the repository root after configuring the database.
