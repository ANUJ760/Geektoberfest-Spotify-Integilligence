const db = require('../config/db');

const ALLOWED_METRICS = {
  danceability: 'danceability',
  energy: 'energy',
  valence: 'valence',
  acousticness: 'acousticness',
  speechiness: 'speechiness',
  instrumentalness: 'instrumentalness',
  liveness: 'liveness',
  tempo: 'tempo',
  loudness: 'loudness',
  popularity: 'popularity',
};

const DEFAULT_COMPARE_METRICS = ['danceability', 'energy', 'valence', 'acousticness', 'speechiness'];
const MIN_BINS = 2;
const MAX_BINS = 20;
const DEFAULT_BINS = 10;
const MIN_GENRES_COMPARE = 2;
const MAX_GENRES_COMPARE = 5;
const MAX_METRICS_COMPARE = 5;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// 1. Fetch a clean, sorted distinct list of all genres in the database (optional bounded limit)
exports.getGenreList = async (req, res, next) => {
  try {
    let limit;
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

    let queryText = `SELECT DISTINCT track_genre FROM genre_analytics ORDER BY track_genre ASC`;
    const params = [];
    if (limit) {
      params.push(limit);
      queryText += ' LIMIT $1';
    }

    const result = await db.query(queryText, params);
    
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

// 1b. Fetch bounded list of ranked genres with track counts
exports.getRankedGenres = async (req, res, next) => {
  try {
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

    const queryText = `
      SELECT track_genre AS genre, track_count, avg_popularity, avg_danceability, avg_energy, avg_valence
      FROM genre_analytics
      ORDER BY track_count DESC, track_genre ASC
      LIMIT $1
    `;
    const result = await db.query(queryText, [limit]);

    res.status(200).json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
};

// 1c. Feature distribution for a single genre using SQL width_bucket aggregation
exports.getGenreDistribution = async (req, res, next) => {
  try {
    const rawGenre = req.params.genreName || req.query.genre;
    if (!rawGenre || String(rawGenre).trim() === '') {
      return res.status(400).json({
        status: 'fail',
        message: 'Genre parameter is required.'
      });
    }
    const genre = String(rawGenre).trim();

    // Verify genre exists in database
    const genreCheck = await db.query(
      'SELECT track_genre FROM genre_analytics WHERE track_genre = $1',
      [genre]
    );
    if (genreCheck.rows.length === 0) {
      const trackCheck = await db.query(
        'SELECT 1 FROM tracks WHERE track_genre = $1 LIMIT 1',
        [genre]
      );
      if (trackCheck.rows.length === 0) {
        return res.status(400).json({
          status: 'fail',
          message: `Genre "${genre}" does not exist.`
        });
      }
    }

    // Validate metric
    if (!req.query.metric || String(req.query.metric).trim() === '') {
      return res.status(400).json({
        status: 'fail',
        message: `Metric parameter is required. Allowed metrics: ${Object.keys(ALLOWED_METRICS).join(', ')}.`
      });
    }
    const metricKey = String(req.query.metric).trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_METRICS, metricKey)) {
      return res.status(400).json({
        status: 'fail',
        message: `Invalid metric parameter: "${req.query.metric}". Allowed metrics are: ${Object.keys(ALLOWED_METRICS).join(', ')}.`
      });
    }
    const col = ALLOWED_METRICS[metricKey];

    // Validate bins
    let bins = DEFAULT_BINS;
    if (req.query.bins !== undefined && req.query.bins !== '') {
      const parsedBins = Number(req.query.bins);
      if (!Number.isInteger(parsedBins) || parsedBins < MIN_BINS || parsedBins > MAX_BINS) {
        return res.status(400).json({
          status: 'fail',
          message: `Bins must be an integer between ${MIN_BINS} and ${MAX_BINS}.`
        });
      }
      bins = parsedBins;
    }

    // Inspect track stats for the genre
    const statsQuery = `
      SELECT 
        COUNT(*) AS total_tracks,
        COUNT(${col}) AS non_null_tracks,
        MIN(${col}) AS min_val,
        MAX(${col}) AS max_val
      FROM tracks
      WHERE track_genre = $1
    `;
    const statsRes = await db.query(statsQuery, [genre]);
    const totalTracks = parseInt(statsRes.rows[0].total_tracks, 10);
    const nonNullTracks = parseInt(statsRes.rows[0].non_null_tracks, 10);

    // Valid genre with zero tracks -> 200 with empty data
    if (totalTracks === 0 || nonNullTracks === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          genre,
          metric: metricKey,
          track_count: totalTracks,
          bins: []
        }
      });
    }

    const minVal = Number(statsRes.rows[0].min_val);
    const maxVal = Number(statsRes.rows[0].max_val);

    // Single distinct value edge case
    if (minVal === maxVal) {
      const binsData = [
        {
          bin: 1,
          bin_start: minVal,
          bin_end: maxVal,
          label: String(minVal),
          count: nonNullTracks
        }
      ];
      return res.status(200).json({
        status: 'success',
        data: {
          genre,
          metric: metricKey,
          track_count: totalTracks,
          bins: binsData
        }
      });
    }

    // SQL width_bucket aggregation
    const bucketQuery = `
      WITH stats AS (
        SELECT $2::double precision AS min_val, $3::double precision AS max_val
      ),
      binned AS (
        SELECT 
          LEAST(GREATEST(width_bucket(${col}, stats.min_val, stats.max_val, $4), 1), $4) AS bucket_num
        FROM tracks, stats
        WHERE track_genre = $1 AND ${col} IS NOT NULL
      )
      SELECT 
        s.bin,
        COUNT(b.bucket_num) AS count
      FROM generate_series(1, $4) AS s(bin)
      LEFT JOIN binned b ON b.bucket_num = s.bin
      GROUP BY s.bin
      ORDER BY s.bin ASC;
    `;
    const bucketRes = await db.query(bucketQuery, [genre, minVal, maxVal, bins]);
    const binWidth = (maxVal - minVal) / bins;

    const binsData = bucketRes.rows.map((row) => {
      const b = parseInt(row.bin, 10);
      const bStart = minVal + (b - 1) * binWidth;
      const bEnd = minVal + b * binWidth;
      const isInt = Number.isInteger(minVal) && Number.isInteger(maxVal) && binWidth >= 1;
      const startLabel = isInt ? Math.round(bStart) : Math.round(bStart * 100) / 100;
      const endLabel = isInt ? Math.round(bEnd) : Math.round(bEnd * 100) / 100;
      return {
        bin: b,
        bin_start: Math.round(bStart * 10000) / 10000,
        bin_end: Math.round(bEnd * 10000) / 10000,
        label: `${startLabel} - ${endLabel}`,
        count: parseInt(row.count, 10)
      };
    });

    return res.status(200).json({
      status: 'success',
      data: {
        genre,
        metric: metricKey,
        track_count: totalTracks,
        bins: binsData
      }
    });
  } catch (error) {
    next(error);
  }
};

// 1d. Compare multiple genres across selected audio metrics (SQL GROUP BY)
exports.compareGenres = async (req, res, next) => {
  try {
    if (!req.query.genres || String(req.query.genres).trim() === '') {
      return res.status(400).json({
        status: 'fail',
        message: 'Genres parameter is required.'
      });
    }

    const rawGenres = String(req.query.genres)
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    // De-duplicate preserving order
    const genres = Array.from(new Set(rawGenres));
    if (genres.length < MIN_GENRES_COMPARE) {
      return res.status(400).json({
        status: 'fail',
        message: `At least ${MIN_GENRES_COMPARE} unique genres are required for comparison.`
      });
    }
    if (genres.length > MAX_GENRES_COMPARE) {
      return res.status(400).json({
        status: 'fail',
        message: `A maximum of ${MAX_GENRES_COMPARE} genres can be compared at once.`
      });
    }

    // Verify all genres exist
    const existCheck = await db.query(
      'SELECT track_genre FROM genre_analytics WHERE track_genre = ANY($1::text[])',
      [genres]
    );
    const existingSet = new Set(existCheck.rows.map((r) => r.track_genre));
    for (const g of genres) {
      if (!existingSet.has(g)) {
        const trackCheck = await db.query('SELECT 1 FROM tracks WHERE track_genre = $1 LIMIT 1', [g]);
        if (trackCheck.rows.length === 0) {
          return res.status(400).json({
            status: 'fail',
            message: `Genre "${g}" does not exist.`
          });
        }
      }
    }

    // Validate metrics
    let metrics = DEFAULT_COMPARE_METRICS;
    if (req.query.metrics !== undefined && req.query.metrics !== '') {
      const rawMetrics = String(req.query.metrics)
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .filter(Boolean);
      const dedupedMetrics = Array.from(new Set(rawMetrics));

      if (dedupedMetrics.length === 0) {
        return res.status(400).json({
          status: 'fail',
          message: 'At least one metric must be specified if metrics parameter is provided.'
        });
      }
      if (dedupedMetrics.length > MAX_METRICS_COMPARE) {
        return res.status(400).json({
          status: 'fail',
          message: `A maximum of ${MAX_METRICS_COMPARE} metrics can be compared at once.`
        });
      }
      for (const m of dedupedMetrics) {
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_METRICS, m)) {
          return res.status(400).json({
            status: 'fail',
            message: `Invalid metric parameter: "${m}". Allowed metrics are: ${Object.keys(ALLOWED_METRICS).join(', ')}.`
          });
        }
      }
      metrics = dedupedMetrics;
    }

    const avgClauses = metrics
      .map((m) => `ROUND(AVG(t.${ALLOWED_METRICS[m]})::numeric, 4) AS avg_${ALLOWED_METRICS[m]}`)
      .join(', ');

    const compareQuery = `
      SELECT 
        g.genre AS track_genre,
        COUNT(t.track_id) AS track_count,
        ${avgClauses}
      FROM unnest($1::text[]) AS g(genre)
      LEFT JOIN tracks t ON t.track_genre = g.genre
      GROUP BY g.genre
      ORDER BY g.genre ASC;
    `;
    const compareResult = await db.query(compareQuery, [genres]);

    const formatted = compareResult.rows.map((row) => {
      const metricValues = {};
      for (const m of metrics) {
        const rawVal = row[`avg_${ALLOWED_METRICS[m]}`];
        metricValues[m] = rawVal !== null && rawVal !== undefined ? Number(rawVal) : null;
      }
      return {
        genre: row.track_genre,
        track_count: parseInt(row.track_count, 10) || 0,
        metrics: metricValues,
      };
    });

    return res.status(200).json({
      status: 'success',
      data: formatted
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

//fetch comprehensive distribution metrics for global dashboard visualization charts
exports.getGlobalDashboardMetrics = async (req,res,next) =>{
  try{
    // Change the tempoQuery text string inside analyticsController.js to this:
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



      //fetch top 10 most energetic/danceable genres from pre-computed metrics
       const topGenresQuery = `
      SELECT track_genre as genre, avg_popularity, avg_energy, avg_danceability, avg_valence
      FROM genre_analytics 
      ORDER BY avg_popularity DESC 
      LIMIT 8;
    `;



    //fetch a clean limited sample of 300 tracks for the popularity vs Energy correlation scatter plot
    //loading all 89,000 nodes directly onto a chart will crash the browser tab.
    const scatterQuery = `
      SELECT track_name, artists, popularity, energy, danceability 
      FROM tracks 
      WHERE popularity > 10
      ORDER BY RANDOM() 
      LIMIT 300;
    `;


    const [tempoResult,genreResult,scatterResult] = await Promise.all([
      db.query(tempoQuery),
      db.query(topGenresQuery),
      db.query(scatterQuery)
    ]);

    res.status(200).json({
      status:'success',
      data:{
      tempoDistribution: tempoResult.rows,
      topGenres: genreResult.rows,
      scatterSample: scatterResult.rows
      }
    });                               
  }catch(error){
    next(error);
  }
}
