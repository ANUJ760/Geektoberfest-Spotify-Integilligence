const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load backend/.env for local development. Render injects environment variables.
dotenv.config({ path: path.join(__dirname, '../../.env') });

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'spotify_intelligence',
      password: process.env.DB_PASSWORD,
      port: Number.parseInt(process.env.DB_PORT, 10) || 5432,
    };

const pool = new Pool(poolConfig);

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
  pool,
};
