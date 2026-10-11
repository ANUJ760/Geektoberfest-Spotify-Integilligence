const db = require('../config/db');

/**
 * Calculates audio feature similarity and returns top recommendations
 * Uses normalized Euclidean distance across:
 * - danceability (0..1)
 * - energy (0..1)
 * - valence (0..1)
 * - acousticness (0..1)
 * - tempo (scaled to ~0..1 using 150 BPM span)
 */
exports.getRecommendations = async (req, res, next) => {
  try {
    const track_id = req.query.track_id || req.params.id;
    const {
      danceability,
      energy,
      valence,
      acousticness,
      tempo,
      genre,
      limit = 10,
    } = req.query;

    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

    let seedTrack = null;
    let targetD = parseFloat(danceability);
    let targetE = parseFloat(energy);
    let targetV = parseFloat(valence);
    let targetA = parseFloat(acousticness);
    let targetT = parseFloat(tempo);

    // If track_id is provided, retrieve its features
    if (track_id) {
      const seedRes = await db.query(
        'SELECT track_id, track_name, artists, album_name, danceability, energy, valence, acousticness, tempo, track_genre FROM tracks WHERE track_id = $1',
        [track_id]
      );
      if (seedRes.rows.length === 0) {
        return res.status(404).json({
          status: 'fail',
          message: 'Seed track not found',
        });
      }
      seedTrack = seedRes.rows[0];
      if (isNaN(targetD)) targetD = seedTrack.danceability ?? 0.5;
      if (isNaN(targetE)) targetE = seedTrack.energy ?? 0.5;
      if (isNaN(targetV)) targetV = seedTrack.valence ?? 0.5;
      if (isNaN(targetA)) targetA = seedTrack.acousticness ?? 0.5;
      if (isNaN(targetT)) targetT = seedTrack.tempo ?? 120.0;
    } else {
      // Validate that at least one target feature is provided
      const hasAnyFeature =
        !isNaN(targetD) || !isNaN(targetE) || !isNaN(targetV) || !isNaN(targetA) || !isNaN(targetT);
      if (!hasAnyFeature) {
        return res.status(400).json({
          status: 'fail',
          message: 'Provide either track_id or target audio features (danceability, energy, valence, acousticness, tempo)',
        });
      }
      targetD = !isNaN(targetD) ? targetD : 0.5;
      targetE = !isNaN(targetE) ? targetE : 0.5;
      targetV = !isNaN(targetV) ? targetV : 0.5;
      targetA = !isNaN(targetA) ? targetA : 0.5;
      targetT = !isNaN(targetT) ? targetT : 120.0;
    }

    // Build query with dynamic filtering
    const queryParams = [targetD, targetE, targetV, targetA, targetT];
    let whereClause = 'WHERE 1=1';

    if (track_id) {
      queryParams.push(track_id);
      whereClause += ` AND track_id != $${queryParams.length}`;
    }

    if (genre) {
      queryParams.push(genre);
      whereClause += ` AND track_genre = $${queryParams.length}`;
    }

    queryParams.push(parsedLimit);
    const limitParamIndex = queryParams.length;

    // Euclidean similarity formula normalized against sqrt(5) maximum distance
    const queryText = `
      SELECT 
        track_id, track_name, artists, album_name, track_genre, popularity, duration_ms, explicit,
        danceability, energy, valence, acousticness, tempo,
        GREATEST(0, ROUND((1.0 - SQRT(
            POWER(COALESCE(danceability, 0.5) - $1, 2) +
            POWER(COALESCE(energy, 0.5) - $2, 2) +
            POWER(COALESCE(valence, 0.5) - $3, 2) +
            POWER(COALESCE(acousticness, 0.5) - $4, 2) +
            POWER((COALESCE(tempo, 120.0) - $5) / 150.0, 2)
        ) / 2.23606797) * 100))::INTEGER as match_score
      FROM tracks
      ${whereClause}
      ORDER BY match_score DESC, popularity DESC
      LIMIT $${limitParamIndex};
    `;

    const result = await db.query(queryText, queryParams);

    res.status(200).json({
      status: 'success',
      seedTrack,
      targetProfile: {
        danceability: targetD,
        energy: targetE,
        valence: targetV,
        acousticness: targetA,
        tempo: targetT,
      },
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

exports.getTrackRecommendations = exports.getRecommendations;
