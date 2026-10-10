const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const apiRoutes = require('./routes/api');
const db = require('./config/db');

// Initialize environment configurations
dotenv.config();

const app = express();
// Middleware configuration
app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads

// Root status check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Welcome to the Spotify Music Intelligence API",
    timestamp: new Date()
  });
});

// Use this endpoint as Render's health check path.
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'healthy' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy' });
  }
});

// Mount modular API routes
app.use('/api', apiRoutes);

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('💥 Server Error Matrix:', err.stack);
  res.status(500).json({
    status: "error",
    message: "An internal server error occurred."
  });
});

async function startServer() {
  try {
    await db.initializeSchema();
    // Run a lightweight test query to ensure PostgreSQL is responding
    await db.query('SELECT NOW()');
    console.log('Database startup ping successful.');

    const port = process.env.PORT || 5000;

    app.listen(port, '0.0.0.0', () => {
      console.log(`Server listening on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to connect to PostgreSQL on startup:', err.message);
    process.exit(1); // Stop the server if the database is dead
  }
}

// Vercel imports the Express app as a function. Keep the database ping and
// local HTTP listener for direct development/production server execution only.
if (require.main === module) {
  startServer();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      try {
        await db.pool.end();
      } finally {
        process.exit(0);
      }
    });
  }
}

module.exports = app;
