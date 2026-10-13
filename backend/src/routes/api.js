const express = require('express');
const router = express.Router();

// Import separate controller functions (we will create these next)
const trackController = require('../controllers/trackController');
const analyticsController = require('../controllers/analyticsController');

// --- Feature 1: Music Explorer Routes ---
// Handles paginated searching, filtering, and listing tracks
router.get('/tracks', trackController.getAllTracks);
// Fetches full individual track details by its unique string ID
router.get('/tracks/:id', trackController.getTrackById);

// --- Feature 4: Genre DNA Routes ---
// Returns a distinct plain array of all available genres in the DB (supports optional bounded limit)
router.get('/genres', analyticsController.getGenreList);

// Feature distribution for a genre (SQL width_bucket aggregation)
router.get('/analytics/genres/distribution', analyticsController.getGenreDistribution);
router.get('/analytics/distribution', analyticsController.getGenreDistribution);

// Genre comparison across audio metrics (SQL GROUP BY)
router.get('/analytics/genres/compare', analyticsController.compareGenres);
router.get('/analytics/compare', analyticsController.compareGenres);

// Ranked genres with track counts and metrics
router.get('/analytics/genres', analyticsController.getRankedGenres);

// Fetches computed metrics for a singular targeted genre
router.get('/analytics/genres/:genreName', analyticsController.getGenreMetrics);
router.get('/analytics/genres/:genreName/distribution', analyticsController.getGenreDistribution);

router.get('/analytics/dashboard', analyticsController.getGlobalDashboardMetrics);
module.exports = router;
