const db = require('../config/db');

const SORT_OPTIONS = {
  popularity: 'popularity DESC, track_id ASC',
  name: 'track_name ASC, track_id ASC',
  duration: 'duration_ms ASC, track_id ASC',
};

// Fetch tracks with dynamic searching, filtering, sorting, and pagination
exports.getAllTracks = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { search, genre, explicit, sortBy } = req.query;

    let sortKey = 'popularity';
    if (sortBy !== undefined && sortBy !== '') {
      const normalized = String(sortBy).toLowerCase().trim();
      if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, normalized)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid sortBy parameter: "${sortBy}". Allowed values are: ${Object.keys(SORT_OPTIONS).join(', ')}.`,
        });
      }
      sortKey = normalized;
    }

    let queryText = `SELECT * FROM tracks WHERE 1=1`;
    let countQueryText = `SELECT COUNT(*) FROM tracks WHERE 1=1`;
    let queryParams = [];

    // search track name or artist field
    if (search) {
      queryParams.push(`%${search}%`);
      const searchIndex = queryParams.length;
      queryText += ` AND (track_name ILIKE $${searchIndex} OR artists ILIKE $${searchIndex})`;
      countQueryText += ` AND (track_name ILIKE $${searchIndex} OR artists ILIKE $${searchIndex})`;
    }

    // genre filter
    if (genre) {
      queryParams.push(genre);
      const genreIndex = queryParams.length;
      queryText += ` AND track_genre = $${genreIndex}`;
      countQueryText += ` AND track_genre = $${genreIndex}`;
    }

    // Explicit filter (0 for clean, 1 for explicit)
    if (explicit !== undefined && explicit !== '') {
      queryParams.push(parseInt(explicit));
      const explicitIndex = queryParams.length;
      queryText += ` AND explicit = $${explicitIndex}`;
      countQueryText += ` AND explicit = $${explicitIndex}`;
    }

    // Append allowlisted sorting with deterministic track_id tie-breaker and pagination rules
    const sortClause = SORT_OPTIONS[sortKey];
    queryText += ` ORDER BY ${sortClause} LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;

    // Execute queries simultaneously using Promise.all to maximize performance
    const [dataResult, countResult] = await Promise.all([
      db.query(queryText, [...queryParams, limit, offset]),
      db.query(countQueryText, queryParams)
    ]);

     const totalTracks = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalTracks / limit);

    res.status(200).json({
      status: 'success',
      totalTracks,
      page,
      totalPages,
      data: dataResult.rows
    });
  } catch (error) {
    next(error);
    }
};



//fetch a specific single track by its precise string ID
exports.getTrackById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const queryText = `SELECT * FROM tracks WHERE track_id = $1`;
    const result = await db.query(queryText, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'Track not found'
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