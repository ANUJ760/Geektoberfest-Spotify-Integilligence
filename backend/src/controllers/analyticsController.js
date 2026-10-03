const db = require('../config/db');

// 1. Fetch a clean, sorted distinct list of all genres in the database
exports.getGenreList = async (req, res, next) => {
  try {
    const queryText = `SELECT DISTINCT track_genre FROM genre_analytics ORDER BY track_genre ASC`;
    const result = await db.query(queryText);
    
    // Flatten array of objects down into a simple array of strings for clean dropdown menus
    const genres = result.rows.map(row => row.track_genre);

    res.status(200).json({
      status: 'success',
      data: genres
    });
  } catch (error) {
    next(error);
  }
};

// 2. Fetch the pre-computed structural DNA averages for a single target genre
exports.getGenreMetrics = async (req, res, next) => {
  try {
    const { genreName } = req.params;
    const queryText = `SELECT * FROM genre_analytics WHERE track_genre = $1`;
    const result = await db.query(queryText, [genreName]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'Metrics for specified genre not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};