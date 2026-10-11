# Spotify Music Intelligence

A full-stack music discovery and analytics app. The React frontend provides a Music Explorer and Analytics Dashboard. An Express API serves track and genre data from PostgreSQL, and a Python script imports the provided Spotify CSV.

## Project structure

```text
backend/          Express API and PostgreSQL queries
frontend/         React + Vite application
Data/raw/         Source Spotify tracks dataset
Data_processing/  CSV cleaning and database import pipeline
```

## Local setup

### Requirements

- Node.js 20.19+ (or 22.12+) and npm
- Python 3.13 recommended
- PostgreSQL 14+
- The CSV file at `Data/raw/spotify_tracks.csv` (included in this repository)

### 1. Create a PostgreSQL database

Start a local PostgreSQL server and create a database, for example:

```bash
createdb spotify_intelligence
```

If `createdb` is unavailable, create a database named `spotify_intelligence` using `psql` or your PostgreSQL GUI. You can also use a Render PostgreSQL database while developing locally; use its **external** connection URL because the internal URL is only reachable from Render services.

### 2. Configure the backend database connection

Copy the example environment file and edit the database URL:

```bash
cp backend/.env.example backend/.env
```

For local PostgreSQL, set `DATABASE_URL` in `backend/.env` to your local credentials:

```dotenv
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/spotify_intelligence
```

Replace `YOUR_PASSWORD` with your PostgreSQL password. For a Render database, use its external URL instead. Keep `.env` files private; never commit credentials. An exported `DATABASE_URL` in your shell or IDE takes precedence over values loaded from `.env`.

### 3. Install Python dependencies and import the CSV

From the repository root:

```bash
python -m pip install --upgrade pip
python -m pip install -r Data_processing/requirements.txt
python Data_processing/clean_data.py
```

The importer reads `DATABASE_URL` from the current environment, the repository-root `.env`, or `backend/.env`. It creates the `tracks` and `genre_analytics` tables if needed, then replaces their rows with the CSV data in one transaction. It prints the number of rows prepared and the database host/name it targets. Do not commit or paste the connection URL into issues.

The importer must be run separately; starting the backend creates the schema but does not import the CSV. Running the importer again replaces the existing table rows.

### 4. Start the backend

Open a terminal in `backend/`:

```bash
cd backend
npm ci
npm run dev
```

The API runs at `http://localhost:5000` by default. The backend loads `backend/.env` and creates the tables if they do not exist. Check its health endpoint at <http://localhost:5000/health>.

### 5. Start the frontend

Open a second terminal in `frontend/`:

```bash
cd frontend
npm ci
npm run dev
```

Open the Vite URL shown in the terminal, usually <http://localhost:5173>. By default, the local frontend sends API requests to `http://localhost:5000/api`. If your backend uses another URL, set `VITE_API_URL` in `frontend/.env.local` to the API base URL, ending in `/api`, then restart Vite.

### Verify the local setup

These endpoints should return JSON. The tracks response should include rows; the genres response should include a list of genre names.

- <http://localhost:5000/health>
- <http://localhost:5000/api/tracks?limit=5>
- <http://localhost:5000/api/genres>

If the health check works but tracks are empty, run the CSV importer and confirm its printed database name/host match the backend's database. If the frontend reports a request error, confirm the backend is running on port 5000 or set `VITE_API_URL` to the actual API base URL.

## Production deployment

### Render backend and PostgreSQL

Create a Render PostgreSQL database and a Render Web Service from this repository:

- Web Service root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
- Environment variable `DATABASE_URL`: the database's **internal** URL, when the web service and database are in the same Render region

Render services in the same region should use the internal URL. To import the CSV from your computer, configure `DATABASE_URL` with the database's **external** URL and run the importer locally. The internal URL is not reachable from outside Render.

### Vercel frontend

Create a Vercel project for this repository with the root directory set to `frontend` and the Vite framework selected. Set this environment variable for the Production environment:

```text
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api
```

Replace the example host with the Render Web Service URL. Redeploy the frontend after adding or changing the variable; Vite embeds it during the build. Set it for Preview deployments too if you want preview builds to call the Render API.

After deployment, verify `https://YOUR-RENDER-SERVICE.onrender.com/health`, `/api/tracks?limit=5`, and `/api/genres`. The frontend's failed requests should point to the Render API host and include `/api` in their path.

## Participant issues and feature ideas

Choose a task, describe the expected behavior, and include reproduction steps for bug fixes. Keep changes focused and include screenshots or examples when they make the result easier to review.

### Easy

- **Validate track pagination and filters (bug):** `/api/tracks` accepts invalid, negative, or very large `page` and `limit` values, and does not validate `explicit`. Reject invalid values with a clear `400` response, cap the page size, and document the supported query parameters.
- **Improve loading, empty, and error states (feature):** The Explorer can show “Genres unavailable” for both an empty genre table and a failed request. Distinguish loading, a successful empty result, and an API/database error; provide retry actions where requests fail.
- **Add track details (feature):** Use the existing `GET /api/tracks/:id` endpoint to show a selected track's album, duration, popularity, and audio features. Include a useful state when the track no longer exists.

### Medium

- **Add explicit-content filtering (feature):** The backend supports an `explicit` query parameter, but the Explorer has no control for it. Add All / Explicit / Clean choices, reset pagination when the filter changes, and preserve the selected choice while navigating pages.
- **Add sorting options (feature):** Allow tracks to be sorted by popularity, name, or duration. Validate the sort field on the server and use a stable tie-breaker so page results do not jump unpredictably.
- **Add playlist and CSV export (feature):** Let users collect tracks while browsing and export the selection as CSV. Preserve selections across pages and avoid duplicate tracks.
- **Add backend API coverage (quality):** Cover filtering, pagination, track lookup, genre analytics, and dashboard response shapes. Document one command contributors can use to run the checks.

### Hard

- **Build audio-feature recommendations (feature):** Add an endpoint that finds tracks similar to a chosen track or target feature profile using danceability, energy, valence, acousticness, and tempo. Define a scoring method, handle missing values, and add controls to explore recommendations.
- **Scale dashboard analytics (performance):** The dashboard runs aggregate queries and uses `ORDER BY RANDOM()` for its track sample. Inspect query plans, add appropriate indexes or a more efficient sampling strategy, and document the performance change.
- **Make CSV imports safe to rerun (data integrity):** Replace the importer's full-table replacement with an incremental or upsert workflow. Ensure track and genre data remain consistent if an import fails, and document how to recover from a partial or interrupted run.
- **Expand genre analytics (feature):** Add bounded API options for feature distributions and genre comparisons, including track counts and selected audio metrics. Add matching charts and handle empty or invalid selections in the UI.
