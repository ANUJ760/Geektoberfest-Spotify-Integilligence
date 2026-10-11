const db = require('../config/db');

// Allowed audio features and their distribution domain bounds
const ALLOWED_FEATURES = {
  danceability: { min: 0.0, max: 1.0, decimals: 2, unit: '' },
  energy: { min: 0.0, max: 1.0, decimals: 2, unit: '' },
  valence: { min: 0.0, max: 1.0, decimals: 2, unit: '' },
  acousticness: { min: 0.0, max: 1.0, decimals: 2, unit: '' },
  speechiness: { min: 0.0, max: 1.0, decimals: 2, unit: '' },
  instrumentalness: { min: 0.0, max: 1.0, decimals: 2, unit: '' },
  liveness: { min: 0.0, max: 1.0, decimals: 2, unit: '' },
  popularity: { min: 0, max: 100, decimals: 0, unit: '' },
  tempo: { min: 50.0, max: 210.0, decimals: 0, unit: ' BPM' },
  loudness: { min: -40.0, max: 0.0, decimals: 1, unit: ' dB' },
};

// Allowed comparison metrics
const ALLOWED_METRICS = {
  popularity: 'avg_popularity',
  danceability: 'avg_danceability',
  energy: 'avg_energy',
  valence: 'avg_valence',
  acousticness: 'avg_acousticness',
  speechiness: 'avg_speechiness',
  instrumentalness: 'avg_instrumentalness',
  tempo: 'avg_tempo',
  track_count: 'track_count',
};

// 1. Fetch a clean, sorted distinct list of all genres in the database
exports.getGenreList = async (req, res, next) => {
  try {
    const queryText = `SELECT DISTINCT track_genre FROM genre_analytics ORDER BY track_genre ASC`;
    const result = await db.query(queryText);

    // Flatten array of objects down into a simple array of strings for clean dropdown menus
    const genres = result.rows.map((row) => row.track_genre);

    res.status(200).json({
      status: 'success',
      data: genres,
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
        message: 'Metrics for specified genre not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

// 3. Bounded feature distribution endpoint
exports.getFeatureDistribution = async (req, res, next) => {
  try {
    const featureName = (req.query.feature || 'tempo').toLowerCase().trim();
    const config = ALLOWED_FEATURES[featureName];

    if (!config) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid feature "${featureName}". Allowed features: ${Object.keys(ALLOWED_FEATURES).join(', ')}`,
      });
    }

    // Bounded bins validation (2 to 25)
    let binCount = 10;
    if (req.query.bins !== undefined) {
      const parsedBins = parseInt(req.query.bins, 10);
      if (isNaN(parsedBins) || parsedBins < 2 || parsedBins > 25) {
        return res.status(400).json({
          status: 'fail',
          message: 'Parameter "bins" must be an integer between 2 and 25',
        });
      }
      binCount = parsedBins;
    }

    const genre = req.query.genre ? req.query.genre.trim() : null;
    const queryParams = [config.min, config.max, binCount];
    let whereClause = `WHERE ${featureName} IS NOT NULL`;

    if (genre) {
      queryParams.push(genre);
      whereClause += ` AND track_genre = $${queryParams.length}`;
    }

    const bucketQuery = `
      SELECT
        LEAST(GREATEST(width_bucket(${featureName}, $1, $2, $3), 1), $3)::INTEGER as bucket,
        COUNT(*)::INTEGER as track_count
      FROM tracks
      ${whereClause}
      GROUP BY bucket
      ORDER BY bucket ASC;
    `;

    const summaryParams = genre ? [genre] : [];
    const summaryWhere = genre
      ? `WHERE ${featureName} IS NOT NULL AND track_genre = $1`
      : `WHERE ${featureName} IS NOT NULL`;

    const summaryQuery = `
      SELECT
        COUNT(*)::INTEGER as total_tracks,
        ROUND(AVG(${featureName})::NUMERIC, 3)::FLOAT as avg_value,
        ROUND(MIN(${featureName})::NUMERIC, 3)::FLOAT as min_value,
        ROUND(MAX(${featureName})::NUMERIC, 3)::FLOAT as max_value
      FROM tracks
      ${summaryWhere};
    `;

    const [bucketResult, summaryResult] = await Promise.all([
      db.query(bucketQuery, queryParams),
      db.query(summaryQuery, summaryParams),
    ]);

    const totalTracks = summaryResult.rows[0]?.total_tracks || 0;
    const step = (config.max - config.min) / binCount;
    const countByBucket = new Map();

    for (const row of bucketResult.rows) {
      countByBucket.set(row.bucket, row.track_count);
    }

    const bins = [];
    for (let b = 1; b <= binCount; b++) {
      const lower = config.min + (b - 1) * step;
      const upper = config.min + b * step;
      const count = countByBucket.get(b) || 0;
      const percentage = totalTracks > 0 ? Math.round((count / totalTracks) * 1000) / 10 : 0;

      const lowerStr = config.decimals > 0 ? lower.toFixed(config.decimals) : Math.round(lower).toString();
      const upperStr = config.decimals > 0 ? upper.toFixed(config.decimals) : Math.round(upper).toString();

      bins.push({
        bin: b,
        label: `${lowerStr} - ${upperStr}${config.unit}`,
        min: Math.round(lower * 1000) / 1000,
        max: Math.round(upper * 1000) / 1000,
        count,
        percentage,
      });
    }

    res.status(200).json({
      status: 'success',
      feature: featureName,
      genre: genre || null,
      binCount,
      totalTracks,
      summary: totalTracks > 0 ? summaryResult.rows[0] : null,
      data: bins,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Bounded genre comparisons endpoint
exports.getGenreComparison = async (req, res, next) => {
  try {
    const rawGenres = req.query.genres;
    let genreList = [];

    if (Array.isArray(rawGenres)) {
      genreList = rawGenres
        .flatMap((g) => String(g).split(','))
        .map((g) => g.trim())
        .filter(Boolean);
    } else if (typeof rawGenres === 'string') {
      genreList = rawGenres
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
    }

    if (genreList.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Parameter "genres" is required. Provide 1 to 6 comma-separated genre names.',
      });
    }

    // Bounded maximum 6 genres
    if (genreList.length > 6) {
      return res.status(400).json({
        status: 'fail',
        message: `Cannot compare more than 6 genres at once (received ${genreList.length})`,
      });
    }

    // Deduplicate while preserving order
    const uniqueGenres = Array.from(new Set(genreList));

    // Parse requested metrics
    let selectedMetrics = [
      'popularity',
      'danceability',
      'energy',
      'valence',
      'acousticness',
      'tempo',
      'track_count',
    ];

    if (req.query.metrics) {
      const metricList = (
        Array.isArray(req.query.metrics) ? req.query.metrics.join(',') : req.query.metrics
      )
        .split(',')
        .map((m) => m.toLowerCase().trim())
        .filter(Boolean);

      for (const m of metricList) {
        if (!ALLOWED_METRICS[m]) {
          return res.status(400).json({
            status: 'fail',
            message: `Invalid metric "${m}". Allowed metrics: ${Object.keys(ALLOWED_METRICS).join(', ')}`,
          });
        }
      }

      if (metricList.length > 0) {
        selectedMetrics = Array.from(new Set(metricList));
      }
    }

    const queryText = `
      SELECT
        track_genre,
        track_count,
        avg_popularity,
        avg_danceability,
        avg_energy,
        avg_valence,
        avg_acousticness,
        avg_speechiness,
        avg_instrumentalness,
        avg_tempo
      FROM genre_analytics
      WHERE track_genre = ANY($1::TEXT[])
      ORDER BY track_count DESC;
    `;

    const result = await db.query(queryText, [uniqueGenres]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'None of the specified genres were found',
      });
    }

    const foundGenres = new Set(result.rows.map((r) => r.track_genre));
    const missingGenres = uniqueGenres.filter((g) => !foundGenres.has(g));

    const formattedData = result.rows.map((row) => {
      const entry = {
        genre: row.track_genre,
        track_count: Number(row.track_count),
      };

      for (const metric of selectedMetrics) {
        if (metric === 'track_count') continue;
        const col = ALLOWED_METRICS[metric];
        const val = row[col];
        entry[metric] = val != null ? Math.round(Number(val) * 1000) / 1000 : null;
      }

      return entry;
    });

    res.status(200).json({
      status: 'success',
      requestedGenres: uniqueGenres,
      foundGenres: Array.from(foundGenres),
      missingGenres,
      metrics: selectedMetrics,
      data: formattedData,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Fetch comprehensive distribution metrics for global dashboard visualization charts
exports.getGlobalDashboardMetrics = async (req, res, next) => {
  try {
    // Optional bounded params
    let topGenresLimit = 8;
    if (req.query.top_genres_limit !== undefined) {
      const parsedLimit = parseInt(req.query.top_genres_limit, 10);
      if (isNaN(parsedLimit) || parsedLimit < 3 || parsedLimit > 20) {
        return res.status(400).json({
          status: 'fail',
          message: 'Parameter "top_genres_limit" must be an integer between 3 and 20',
        });
      }
      topGenresLimit = parsedLimit;
    }

    let sampleSize = 300;
    if (req.query.sample_size !== undefined) {
      const parsedSize = parseInt(req.query.sample_size, 10);
      if (isNaN(parsedSize) || parsedSize < 50 || parsedSize > 500) {
        return res.status(400).json({
          status: 'fail',
          message: 'Parameter "sample_size" must be an integer between 50 and 500',
        });
      }
      sampleSize = parsedSize;
    }

    const tempoQuery = `
      SELECT 
        CASE 
          WHEN tempo < 80 THEN '060-080 BPM'
          WHEN tempo >= 80 AND tempo < 100 THEN '080-100 BPM'
          WHEN tempo >= 100 AND tempo < 120 THEN '100-120 BPM'
          WHEN tempo >= 120 AND tempo < 140 THEN '120-140 BPM'
          WHEN tempo >= 140 AND tempo < 160 THEN '140-160 BPM'
          ELSE '160+ BPM'
        END as tempo_bin,
        COUNT(*) as track_count
      FROM tracks
      GROUP BY 1
      ORDER BY 1 ASC;
    `;

    const topGenresQuery = `
      SELECT track_genre as genre, track_count, avg_popularity, avg_energy, avg_danceability, avg_valence, avg_acousticness, avg_tempo
      FROM genre_analytics 
      ORDER BY avg_popularity DESC 
      LIMIT $1;
    `;

    const scatterQuery = `
      SELECT track_name, artists, popularity, energy, danceability 
      FROM tracks 
      WHERE popularity > 10
      ORDER BY RANDOM() 
      LIMIT $1;
    `;

    const [tempoResult, genreResult, scatterResult] = await Promise.all([
      db.query(tempoQuery),
      db.query(topGenresQuery, [topGenresLimit]),
      db.query(scatterQuery, [sampleSize]),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        tempoDistribution: tempoResult.rows,
        topGenres: genreResult.rows,
        scatterSample: scatterResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};
