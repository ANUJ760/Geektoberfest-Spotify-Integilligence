const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load backend/.env for local development. Render injects environment variables.
dotenv.config({ path: path.join(__dirname, '../../.env') });

function buildPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  const sslFlag = process.env.DB_SSL === 'true';

  if (databaseUrl) {
    let connectionString = databaseUrl;
    let useSsl = sslFlag;

    try {
      const parsedUrl = new URL(databaseUrl);
      const sslMode = parsedUrl.searchParams.get('sslmode');
      const externalRenderDatabase = parsedUrl.hostname.includes('render.com')
        && !parsedUrl.hostname.includes('.internal');

      useSsl = useSsl
        || ['require', 'verify-ca', 'verify-full'].includes(sslMode)
        || externalRenderDatabase;

      // Pass TLS options through node-postgres directly, avoiding conflicting
      // sslmode parsing from the connection string.
      if (useSsl && sslMode) {
        parsedUrl.searchParams.delete('sslmode');
        connectionString = parsedUrl.toString();
      }
    } catch (error) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }

    return {
      connectionString,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    };
  }

  const config = {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'spotify_intelligence',
      password: process.env.DB_PASSWORD,
      port: Number.parseInt(process.env.DB_PORT, 10) || 5432,
    };

  if (sslFlag) config.ssl = { rejectUnauthorized: false };
  return config;
}

const poolConfig = buildPoolConfig();

const pool = new Pool(poolConfig);

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS tracks (
    track_id TEXT PRIMARY KEY,
    track_name TEXT NOT NULL,
    artists TEXT NOT NULL,
    album_name TEXT,
    track_genre TEXT,
    popularity INTEGER,
    duration_ms INTEGER,
    explicit SMALLINT NOT NULL DEFAULT 0 CHECK (explicit IN (0, 1)),
    danceability DOUBLE PRECISION,
    energy DOUBLE PRECISION,
    loudness DOUBLE PRECISION,
    speechiness DOUBLE PRECISION,
    acousticness DOUBLE PRECISION,
    instrumentalness DOUBLE PRECISION,
    liveness DOUBLE PRECISION,
    valence DOUBLE PRECISION,
    tempo DOUBLE PRECISION
  )`,
  `CREATE TABLE IF NOT EXISTS genre_analytics (
    track_genre TEXT PRIMARY KEY,
    avg_popularity DOUBLE PRECISION,
    avg_danceability DOUBLE PRECISION,
    avg_energy DOUBLE PRECISION,
    avg_valence DOUBLE PRECISION,
    avg_acousticness DOUBLE PRECISION,
    avg_instrumentalness DOUBLE PRECISION,
    avg_speechiness DOUBLE PRECISION,
    avg_tempo DOUBLE PRECISION,
    track_count BIGINT NOT NULL DEFAULT 0
  )`,
  'CREATE INDEX IF NOT EXISTS tracks_popularity_idx ON tracks (popularity DESC)',
  'CREATE INDEX IF NOT EXISTS tracks_genre_idx ON tracks (track_genre)',
];

async function initializeSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const statement of schemaStatements) {
      await client.query(statement);
    }
    await client.query('COMMIT');
    console.log('Database schema is ready.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

pool.on('connect', () => {
  console.log('PostgreSQL connection established.');
});

pool.on('error', (err) => {
  // A transient idle-client failure should be logged; pg can create a new
  // connection for the next query without terminating the whole web service.
  console.error('Unexpected database connection failure on idle client:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  initializeSchema,
  pool,
};
