
const db = require('../config/db');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const SORT_OPTIONS = {
  popularity: 'popularity DESC, track_id ASC',
  name: 'track_name ASC, track_id ASC',
  duration: 'duration_ms ASC, track_id ASC',
};

// Fetch tracks with searching, filtering, sorting, and pagination
exports.getAllTracks = async (req, res, next) => {
  try {
    // Validate pagination
    let page = DEFAULT_PAGE;

    if (req.query.page !== undefined && req.query.page !== '') {
      const parsedPage = Number(req.query.page);

      if (!Number.isInteger(parsedPage) || parsedPage < 1) {
        return res.status(400).json({
          status: 'fail',
          message: 'Page must be a positive integer greater than or equal to 1.'
        });
      }

      page = parsedPage;
    }

    let limit = DEFAULT_LIMIT;

    if (req.query.limit !== undefined && req.query.limit !== '') {
      const parsedLimit = Number(req.query.limit);

      if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({
          status: 'fail',
          message: 'Limit must be a positive integer greater than or equal to 1.'
        });
      }

      limit = Math.min(parsedLimit, MAX_LIMIT);
    }

    const offset = (page - 1) * limit;
    const { search, genre, explicit, sortBy } = req.query;

    // Validate sorting against an allowlist
    let sortKey = 'popularity';

    if (sortBy !== undefined && sortBy !== '') {
      const normalized = String(sortBy).toLowerCase().trim();

      if (!Object.prototype.hasOwnProperty.call(SORT_OPTIONS, normalized)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid sortBy parameter: "${sortBy}". Allowed values are: ${Object.keys(SORT_OPTIONS).join(', ')}.`
        });
      }

      sortKey = normalized;
    }

    let queryText = 'SELECT * FROM tracks WHERE 1=1';
    let countQueryText = 'SELECT COUNT(*) FROM tracks WHERE 1=1';
    const queryParams = [];

    // Search track name or artist
    if (search) {
      queryParams.push(`%${search}%`);
      const searchIndex = queryParams.length;

      queryText += ` AND (track_name ILIKE $${searchIndex} OR artists ILIKE $${searchIndex})`;
      countQueryText += ` AND (track_name ILIKE $${searchIndex} OR artists ILIKE $${searchIndex})`;
    }

    // Filter by genre
    if (genre) {
      queryParams.push(genre);
      const genreIndex = queryParams.length;

      queryText += ` AND track_genre = $${genreIndex}`;
      countQueryText += ` AND track_genre = $${genreIndex}`;
    }

    // Filter explicit content
    if (explicit !== undefined && explicit !== '') {
      const rawExplicit = String(explicit).trim().toLowerCase();
      let explicitVal;

      if (
        rawExplicit === '0' ||
        rawExplicit === 'false' ||
        rawExplicit === 'clean'
      ) {
        explicitVal = 0;
      } else if (
        rawExplicit === '1' ||
        rawExplicit === 'true' ||
        rawExplicit === 'explicit'
      ) {
        explicitVal = 1;
      } else {
        return res.status(400).json({
          status: 'fail',
          message: 'Explicit parameter must be 0, 1, true, false, clean, or explicit.'
        });
      }

      queryParams.push(explicitVal);
      const explicitIndex = queryParams.length;

      queryText += ` AND explicit = $${explicitIndex}`;
      countQueryText += ` AND explicit = $${explicitIndex}`;
    }

    // Apply allowlisted sorting and pagination
    const sortClause = SORT_OPTIONS[sortKey];
    const limitIndex = queryParams.length + 1;
    const offsetIndex = queryParams.length + 2;

    queryText += ` ORDER BY ${sortClause} LIMIT $${limitIndex} OFFSET $${offsetIndex}`;

    // Execute data and count queries concurrently
    const [dataResult, countResult] = await Promise.all([
      db.query(queryText, [...queryParams, limit, offset]),
      db.query(countQueryText, queryParams)
    ]);

    const totalTracks = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalTracks / limit);

    return res.status(200).json({
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