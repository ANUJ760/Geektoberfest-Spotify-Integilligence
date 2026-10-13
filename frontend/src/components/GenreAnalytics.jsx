import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { trackService } from '../services/api';

/* ------------------------------------------------------------------ */
/*  Design Tokens & Whitelist Constants                                */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#EFEFEA',
  card: '#FFFFFF',
  ink: '#000000',
  red: '#D9383A',
  soft: 'rgba(0, 0, 0, 0.6)',
  grid: 'rgba(0, 0, 0, 0.12)',
  accent1: '#000000',
  accent2: '#D9383A',
  accent3: '#4A5568',
  accent4: '#718096',
  accent5: '#A0AEC0',
};

const METRIC_COLORS = [C.accent1, C.accent2, C.accent3, C.accent4, C.accent5];

const SANS = '"Helvetica Neue", Helvetica, Arial, "Inter", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

const WHITELIST_METRICS = [
  { key: 'danceability', label: 'DANCEABILITY', isScaled: true },
  { key: 'energy', label: 'ENERGY', isScaled: true },
  { key: 'valence', label: 'VALENCE', isScaled: true },
  { key: 'acousticness', label: 'ACOUSTICNESS', isScaled: true },
  { key: 'speechiness', label: 'SPEECHINESS', isScaled: true },
  { key: 'tempo', label: 'TEMPO (BPM)', isScaled: false },
  { key: 'loudness', label: 'LOUDNESS (DB)', isScaled: false },
  { key: 'popularity', label: 'POPULARITY', isScaled: false },
];

const MAX_COMPARE_GENRES = 5;
const MIN_COMPARE_GENRES = 2;
const MAX_COMPARE_METRICS = 5;
const BIN_OPTIONS = [5, 10, 15, 20];

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const labelText = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.ink,
};

const S = {
  panel: {
    background: C.card,
    border: `2px solid ${C.ink}`,
    boxShadow: `6px 6px 0 ${C.ink}`,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  panelHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    borderBottom: `2px solid ${C.ink}`,
    flexWrap: 'wrap',
  },
  panelTitle: {
    margin: 0,
    color: C.ink,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    textAlign: 'left',
  },
  panelIndex: { fontFamily: MONO, fontWeight: 800, color: C.red, marginRight: 10 },
  panelMeta: { fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.ink },
  panelBody: { padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 },
  controlsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 14,
    alignItems: 'flex-start',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' },
  fieldLabel: { ...labelText },
  select: {
    width: '100%',
    height: 42,
    padding: '0 10px',
    background: C.card,
    color: C.ink,
    border: `2px solid ${C.ink}`,
    borderRadius: 0,
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  chartBox: { width: '100%', height: 320, minWidth: 0, position: 'relative' },
  emptyOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 24,
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: C.ink,
    pointerEvents: 'none',
  },
  warn: {
    margin: 0,
    padding: '8px 12px',
    border: `2px solid ${C.red}`,
    color: C.red,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  hint: {
    margin: 0,
    padding: '8px 12px',
    border: `2px solid ${C.ink}`,
    color: C.ink,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: '#F5F5F0',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  activeChip: {
    padding: '6px 10px',
    background: C.ink,
    color: C.card,
    border: `2px solid ${C.ink}`,
    borderRadius: 0,
    fontFamily: SANS,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  metricChip: (selected, disabled) => ({
    padding: '5px 8px',
    background: selected ? C.ink : C.card,
    color: selected ? C.card : C.ink,
    border: `2px solid ${C.ink}`,
    borderRadius: 0,
    fontFamily: SANS,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
  }),
  button: {
    height: 40,
    padding: '0 18px',
    background: C.card,
    color: C.ink,
    border: `2px solid ${C.ink}`,
    borderRadius: 0,
    fontFamily: SANS,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  retryRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    border: `2px solid ${C.red}`,
    padding: '10px 14px',
  },
  countsList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    paddingTop: 8,
    borderTop: `1px solid ${C.grid}`,
  },
  countBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
};

const axisTick = { fontFamily: MONO, fontSize: 10, fontWeight: 700, fill: C.ink };
const axisLabel = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.08em',
  fill: C.ink,
};

function BrutalTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: C.card,
        border: `2px solid ${C.ink}`,
        padding: '8px 12px',
        fontFamily: MONO,
        fontSize: 12,
        color: C.ink,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        minWidth: 130,
      }}
    >
      {label !== undefined && label !== '' && (
        <div style={{ fontWeight: 800, marginBottom: 6, borderBottom: `1px solid ${C.grid}`, paddingBottom: 4 }}>
          {label}
        </div>
      )}
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', color: p.color || C.ink }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 800 }}>
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Genre Analytics Main Component                                     */
/* ------------------------------------------------------------------ */

export default function GenreAnalytics({ genreOptions = [] }) {
  /* --- 1. Distribution State --- */
  const [distGenre, setDistGenre] = useState('');
  const [distMetric, setDistMetric] = useState('energy');
  const [distBins, setDistBins] = useState(10);
  const [distData, setDistData] = useState(null);
  const [distStatus, setDistStatus] = useState('idle'); // idle | loading | ready | error | empty
  const [distError, setDistError] = useState(null);
  const [distRetry, setDistRetry] = useState(0);

  /* --- 2. Comparison State --- */
  const [compGenres, setCompGenres] = useState([]);
  const [compMetrics, setCompMetrics] = useState(['danceability', 'energy', 'valence']);
  const [compData, setCompData] = useState([]);
  const [compStatus, setCompStatus] = useState('idle'); // idle | loading | ready | error | empty | invalid
  const [compError, setCompError] = useState(null);
  const [compRetry, setCompRetry] = useState(0);
  const [addGenreValue, setAddGenreValue] = useState('');

  /* Pre-populate defaults once genres become available */
  useEffect(() => {
    if (genreOptions.length > 0) {
      setDistGenre((prev) => prev || (genreOptions[0] || ''));
      setCompGenres((prev) => (prev.length === 0 ? genreOptions.slice(0, 3) : prev));
    }
  }, [genreOptions]);

  /* --- Effect: Load Distribution Data --- */
  useEffect(() => {
    if (!distGenre) {
      setDistStatus('idle');
      setDistData(null);
      return;
    }

    let cancelled = false;
    setDistStatus('loading');
    setDistError(null);

    (async () => {
      try {
        const res = await trackService.getGenreDistribution(distGenre, distMetric, distBins);
        if (cancelled) return;
        const payload = res?.data ?? res;
        if (!payload || !payload.bins || payload.bins.length === 0 || payload.track_count === 0) {
          setDistData(payload || null);
          setDistStatus('empty');
        } else {
          setDistData(payload);
          setDistStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          const errMsg = err?.response?.data?.message || err?.message || 'Failed to load feature distribution';
          setDistError(errMsg);
          setDistStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [distGenre, distMetric, distBins, distRetry]);

  /* --- Effect: Load Comparison Data --- */
  useEffect(() => {
    if (compGenres.length < MIN_COMPARE_GENRES) {
      setCompStatus('invalid');
      setCompData([]);
      return;
    }
    if (compMetrics.length === 0) {
      setCompStatus('invalid');
      setCompData([]);
      return;
    }

    let cancelled = false;
    setCompStatus('loading');
    setCompError(null);

    (async () => {
      try {
        const res = await trackService.compareGenres(compGenres, compMetrics);
        if (cancelled) return;
        const payload = res?.data ?? res;
        const list = Array.isArray(payload) ? payload : [];
        if (list.length === 0 || list.every((item) => Number(item.track_count) === 0)) {
          setCompData(list);
          setCompStatus('empty');
        } else {
          setCompData(list);
          setCompStatus('ready');
        }
      } catch (err) {
        if (!cancelled) {
          const errMsg = err?.response?.data?.message || err?.message || 'Failed to load genre comparison';
          setCompError(errMsg);
          setCompStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compGenres, compMetrics, compRetry]);

  /* Genre comparison helpers */
  const handleAddGenre = (genreToAdd) => {
    if (!genreToAdd) return;
    if (compGenres.includes(genreToAdd)) return;
    if (compGenres.length >= MAX_COMPARE_GENRES) return;
    setCompGenres([...compGenres, genreToAdd]);
    setAddGenreValue('');
  };

  const handleRemoveGenre = (genreToRemove) => {
    setCompGenres(compGenres.filter((g) => g !== genreToRemove));
  };

  const handleToggleMetric = (metricKey) => {
    if (compMetrics.includes(metricKey)) {
      if (compMetrics.length <= 1) return; // Keep at least 1 metric
      setCompMetrics(compMetrics.filter((m) => m !== metricKey));
    } else {
      if (compMetrics.length >= MAX_COMPARE_METRICS) return;
      setCompMetrics([...compMetrics, metricKey]);
    }
  };

  /* Prepare comparison chart data */
  const compChartData = compData.map((item) => {
    const row = {
      genre: item.genre,
      track_count: Number(item.track_count) || 0,
    };
    for (const m of compMetrics) {
      const rawVal = item?.metrics?.[m];
      const numVal = rawVal !== null && rawVal !== undefined ? Number(rawVal) : 0;
      // Scale 0.0 - 1.0 metrics to 0 - 100 percentage for readable comparisons
      const metricDef = WHITELIST_METRICS.find((def) => def.key === m);
      row[m] = metricDef?.isScaled ? Math.round(numVal * 1000) / 10 : numVal;
    }
    return row;
  });

  return (
    <section aria-label="Genre Analytics Section" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 2-Column Responsive Layout */}
      <div className="md-two">
        {/* Panel 1: Feature Distribution */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <h2 style={S.panelTitle}>
              <span style={S.panelIndex}>04 //</span>
              Feature Distribution
            </h2>
            {distData && distStatus === 'ready' && (
              <span style={S.panelMeta}>
                {distData.track_count?.toLocaleString()} TRACKS
              </span>
            )}
          </div>

          <div style={S.panelBody}>
            {/* Distribution Controls */}
            <div style={S.controlsGrid}>
              <div style={S.field}>
                <label htmlFor="dist-genre-select" style={S.fieldLabel}>Genre</label>
                <select
                  id="dist-genre-select"
                  className="md-focus"
                  value={distGenre}
                  onChange={(e) => setDistGenre(e.target.value)}
                  style={S.select}
                >
                  <option value="">Select genre</option>
                  {genreOptions.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div style={S.field}>
                <label htmlFor="dist-metric-select" style={S.fieldLabel}>Metric</label>
                <select
                  id="dist-metric-select"
                  className="md-focus"
                  value={distMetric}
                  onChange={(e) => setDistMetric(e.target.value)}
                  style={S.select}
                >
                  {WHITELIST_METRICS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div style={S.field}>
                <label htmlFor="dist-bins-select" style={S.fieldLabel}>Buckets (Bins)</label>
                <select
                  id="dist-bins-select"
                  className="md-focus"
                  value={distBins}
                  onChange={(e) => setDistBins(Number(e.target.value))}
                  style={S.select}
                >
                  {BIN_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b} Bins</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Error State with Retry */}
            {distStatus === 'error' && (
              <div style={S.retryRow}>
                <span style={{ ...S.warn, border: 'none', padding: 0 }}>
                  ERROR: {String(distError).toUpperCase()}
                </span>
                <button
                  type="button"
                  className="md-btn md-focus"
                  style={S.button}
                  onClick={() => setDistRetry((k) => k + 1)}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Distribution Chart */}
            <div style={S.chartBox}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={distData?.bins || []}
                  barCategoryGap="6%"
                  margin={{ top: 8, right: 8, bottom: 24, left: 0 }}
                >
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={axisTick}
                    stroke={C.ink}
                    tickLine={false}
                    minTickGap={6}
                    label={{
                      value: `${distMetric.toUpperCase()} RANGE`,
                      position: 'insideBottom',
                      offset: -14,
                      style: axisLabel,
                    }}
                  />
                  <YAxis
                    tick={axisTick}
                    stroke={C.ink}
                    tickLine={false}
                    width={50}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(217, 56, 58, 0.12)' }}
                    content={<BrutalTooltip />}
                  />
                  <Bar
                    dataKey="count"
                    name="Tracks"
                    fill={C.ink}
                    radius={0}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>

              {distStatus === 'loading' && (
                <div style={S.emptyOverlay}>Loading feature distribution...</div>
              )}
              {distStatus === 'idle' && (
                <div style={S.emptyOverlay}>Select a genre to view distribution</div>
              )}
              {distStatus === 'empty' && (
                <div style={S.emptyOverlay}>No tracks for this selection</div>
              )}
            </div>
          </div>
        </div>

        {/* Panel 2: Genre Comparison */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <h2 style={S.panelTitle}>
              <span style={S.panelIndex}>05 //</span>
              Genre Comparison
            </h2>
            <span style={S.panelMeta}>
              {compGenres.length} / {MAX_COMPARE_GENRES} GENRES SELECTED
            </span>
          </div>

          <div style={S.panelBody}>
            {/* Multi-genre selection controls */}
            <div style={S.field}>
              <label htmlFor="comp-add-genre" style={S.fieldLabel}>
                Compare Genres (Min 2, Max 5)
              </label>
              <div style={S.chipRow}>
                {compGenres.map((g) => (
                  <button
                    key={g}
                    type="button"
                    style={S.activeChip}
                    title={`Remove ${g}`}
                    onClick={() => handleRemoveGenre(g)}
                  >
                    <span>{g}</span>
                    <span style={{ fontWeight: 900 }}>✕</span>
                  </button>
                ))}
              </div>

              {compGenres.length < MAX_COMPARE_GENRES ? (
                <select
                  id="comp-add-genre"
                  className="md-focus"
                  value={addGenreValue}
                  onChange={(e) => handleAddGenre(e.target.value)}
                  style={{ ...S.select, marginTop: 4 }}
                >
                  <option value="">+ Add genre to compare...</option>
                  {genreOptions
                    .filter((g) => !compGenres.includes(g))
                    .map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                </select>
              ) : (
                <p style={S.hint}>Maximum 5 genres selected. Remove a genre to add another.</p>
              )}

              {compGenres.length < MIN_COMPARE_GENRES && (
                <p style={S.warn}>Select at least 2 genres to compare (currently {compGenres.length})</p>
              )}
            </div>

            {/* Metric selection chips */}
            <div style={S.field}>
              <span style={S.fieldLabel}>
                Selected Metrics ({compMetrics.length}/{MAX_COMPARE_METRICS})
              </span>
              <div style={S.chipRow}>
                {WHITELIST_METRICS.slice(0, 5).map((m) => {
                  const isSelected = compMetrics.includes(m.key);
                  const isMaxed = compMetrics.length >= MAX_COMPARE_METRICS && !isSelected;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={isMaxed}
                      style={S.metricChip(isSelected, isMaxed)}
                      onClick={() => handleToggleMetric(m.key)}
                      title={isMaxed ? 'Maximum 5 metrics reached' : undefined}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error State with Retry */}
            {compStatus === 'error' && (
              <div style={S.retryRow}>
                <span style={{ ...S.warn, border: 'none', padding: 0 }}>
                  ERROR: {String(compError).toUpperCase()}
                </span>
                <button
                  type="button"
                  className="md-btn md-focus"
                  style={S.button}
                  onClick={() => setCompRetry((k) => k + 1)}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Grouped Bar Chart */}
            <div style={S.chartBox}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={compChartData}
                  barGap={4}
                  barCategoryGap="16%"
                  margin={{ top: 8, right: 8, bottom: 24, left: 0 }}
                >
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis
                    dataKey="genre"
                    tick={axisTick}
                    stroke={C.ink}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tick={axisTick}
                    stroke={C.ink}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip content={<BrutalTooltip />} />
                  <Legend
                    wrapperStyle={{
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      paddingTop: 8,
                    }}
                  />
                  {compMetrics.map((mKey, idx) => {
                    const metricDef = WHITELIST_METRICS.find((def) => def.key === mKey);
                    return (
                      <Bar
                        key={mKey}
                        dataKey={mKey}
                        name={metricDef ? metricDef.label : mKey.toUpperCase()}
                        fill={METRIC_COLORS[idx % METRIC_COLORS.length]}
                        radius={0}
                        isAnimationActive={false}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>

              {compStatus === 'loading' && (
                <div style={S.emptyOverlay}>Loading genre comparison...</div>
              )}
              {compStatus === 'invalid' && (
                <div style={S.emptyOverlay}>Select at least 2 genres to compare</div>
              )}
              {compStatus === 'empty' && (
                <div style={S.emptyOverlay}>No tracks for this selection</div>
              )}
            </div>

            {/* Track Counts Footer */}
            {compStatus === 'ready' && compChartData.length > 0 && (
              <div style={S.countsList}>
                <span style={labelText}>Track Counts:</span>
                {compChartData.map((d) => (
                  <span key={d.genre} style={S.countBadge}>
                    <strong>{d.genre}:</strong> {d.track_count.toLocaleString()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
