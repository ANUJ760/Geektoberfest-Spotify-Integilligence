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

// --- Feature 4: Genre DNA & Analytics Routes ---
// Returns a distinct plain array of all available genres in the DB
router.get('/genres', analyticsController.getGenreList);
// Bounded feature distributions
router.get('/analytics/distribution', analyticsController.getFeatureDistribution);
// Bounded multi-genre comparisons
router.get('/analytics/compare', analyticsController.getGenreComparison);
// Fetches computed metrics for a singular targeted genre
router.get('/analytics/genres/:genreName', analyticsController.getGenreMetrics);

router.get('/analytics/dashboard', analyticsController.getGlobalDashboardMetrics);
module.exports = router;
