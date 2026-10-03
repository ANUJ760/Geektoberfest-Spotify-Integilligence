const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const apiRoutes = require('./routes/api');
const db=require('./config/db');

// Initialize environment configurations
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

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
    // Run a lightweight test query to ensure PostgreSQL is responding
    await db.query('SELECT NOW()');
    console.log('Database startup ping successful.');

    app.listen(PORT, () => {
      console.log(` API Server dynamically running on: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to connect to PostgreSQL on startup:', err.message);
    process.exit(1); // Stop the server if the database is dead
  }
}

startServer();

