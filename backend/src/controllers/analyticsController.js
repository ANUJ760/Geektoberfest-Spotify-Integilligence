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



    // Efficient sampling for scatter plot without full-table RANDOM() sort.
    // TABLESAMPLE BERNOULLI (5) samples rows uniformly at random with ~95% less execution time.
    // If the sample returns fewer than 50 rows (e.g. in small test environments), fallback to ORDER BY RANDOM().
    const sampleQuery = `
      SELECT track_name, artists, popularity, energy, danceability 
      FROM tracks TABLESAMPLE BERNOULLI (5) 
      WHERE popularity > 10 
      LIMIT 300;
    `;

    let [tempoResult, genreResult, scatterResult] = await Promise.all([
      db.query(tempoQuery),
      db.query(topGenresQuery),
      db.query(sampleQuery)
    ]);

    if (scatterResult.rows.length < 50) {
      const fallbackQuery = `
        SELECT track_name, artists, popularity, energy, danceability 
        FROM tracks 
        WHERE popularity > 10 
        ORDER BY RANDOM() 
        LIMIT 300;
      `;
      scatterResult = await db.query(fallbackQuery);
    }

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
