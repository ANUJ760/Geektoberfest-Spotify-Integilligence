import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { trackService } from '../services/api';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#EFEFEA',
  card: '#FFFFFF',
  ink: '#000000',
  red: '#D9383A',
  soft: 'rgba(0, 0, 0, 0.6)',
  grid: 'rgba(0, 0, 0, 0.12)',
};

const SANS = '"Helvetica Neue", Helvetica, Arial, "Inter", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

const GENRE_COLORS = ['#000000', '#D9383A', '#1DB954', '#2563EB', '#D97706'];

const DIST_FEATURES = [
  { key: 'tempo', label: 'Tempo (BPM)' },
  { key: 'danceability', label: 'Danceability' },
  { key: 'energy', label: 'Energy' },
  { key: 'valence', label: 'Valence' },
  { key: 'acousticness', label: 'Acousticness' },
  { key: 'speechiness', label: 'Speechiness' },
  { key: 'popularity', label: 'Popularity' },
  { key: 'loudness', label: 'Loudness (dB)' },
];

const COMP_METRICS_LIST = [
  { key: 'popularity', label: 'Popularity' },
  { key: 'danceability', label: 'Danceability' },
  { key: 'energy', label: 'Energy' },
  { key: 'valence', label: 'Valence' },
  { key: 'acousticness', label: 'Acousticness' },
  { key: 'tempo', label: 'Tempo' },
];

const FEATURES = [
  { key: 'danceability', label: 'DANCEABILITY' },
  { key: 'energy', label: 'ENERGY' },
  { key: 'valence', label: 'VALENCE' },
  { key: 'acousticness', label: 'ACOUSTICNESS' },
  { key: 'speechiness', label: 'SPEECHINESS' },
];

const CHART_HEIGHT = 340;

/* Media queries, hover and focus states cannot be written inline. */
const GLOBAL_CSS = `
  .md-root, .md-root * { box-sizing: border-box; }
  .md-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; }
  .md-dna { display: grid; grid-template-columns: minmax(280px, 380px) minmax(0, 1fr); }
  .md-focus:focus-visible { outline: 3px solid ${C.red}; outline-offset: 2px; }
  .md-btn:not(:disabled):hover { background: ${C.ink}; color: ${C.card}; }
  .md-chip:hover { background: ${C.red}; border-color: ${C.red}; color: ${C.card}; }
  @media (max-width: 900px) {
    .md-two { grid-template-columns: minmax(0, 1fr); }
    .md-dna { grid-template-columns: minmax(0, 1fr); }
    .md-dna-controls { border-right: none !important; border-bottom: 2px solid ${C.ink}; }
  }
`;

/* ------------------------------------------------------------------ */
/*  Data helpers                                                       */
/* ------------------------------------------------------------------ */

const unwrap = (res) => {
  const isAxios = res && typeof res === 'object' && res.status !== undefined && res.headers;
  return isAxios ? res.data : res;
};

/** 0.0 - 1.0 database coefficient -> 0 - 100 percentage, one decimal, clamped. */
const toPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n * 1000) / 10));
};

/** Reads one audio coefficient from several plausible response shapes. */
const readFeature = (source, key) => {
  const raw =
    source?.[key] ??
    source?.[`avg_${key}`] ??
    source?.features?.[key] ??
    source?.audioFeatures?.[key] ??
    source?.profile?.[key];
  const n = Number(raw);
  return raw === undefined || raw === null || !Number.isFinite(n) ? null : n;
};

const hasAnyFeature = (source) =>
  Boolean(source) && FEATURES.some((f) => readFeature(source, f.key) !== null);

/** Finds the object that actually carries the five audio coefficients. */
const extractProfile = (body) => {
  const candidates = [
    body,
    body?.data,
    body?.profile,
    body?.features,
    body?.audioFeatures,
    Array.isArray(body) ? body[0] : null,
    Array.isArray(body?.data) ? body.data[0] : null,
  ];
  return candidates.find((c) => c && typeof c === 'object' && hasAnyFeature(c)) ?? null;
};

const readGenreName = (g) =>
  typeof g === 'string' ? g : g?.genre ?? g?.name ?? g?.track_genre ?? g?._id ?? '';

/** Accepts [{ range, count }] or { "100-120": 340, ... }. */
const normalizeTempo = (input) => {
  let list = [];
  if (Array.isArray(input)) {
    list = input;
  } else if (input && typeof input === 'object') {
    list = Object.entries(input).map(([label, count]) => ({ label, count }));
  }
  return list.map((d, i) => ({
    label: String(
      d.bin ?? d.range ?? d.tempo_range ?? d.label ?? d.name ?? d.tempo ?? `BIN ${i + 1}`,
    ),
    count: Number(d.count ?? d.tracks ?? d.value ?? d.total ?? 0) || 0,
  }));
};

/** Scatter points; if energy arrives as 0.0 - 1.0 it is scaled to 0 - 100. */
const normalizeScatter = (input) => {
  const points = (Array.isArray(input) ? input : [])
    .map((d) => ({
      energy: Number(d.energy ?? d.x),
      popularity: Number(d.popularity ?? d.y),
      name: d.track_name ?? d.name ?? d.title ?? '',
    }))
    .filter((p) => Number.isFinite(p.energy) && Number.isFinite(p.popularity));

  const maxEnergy = points.reduce((m, p) => Math.max(m, p.energy), 0);
  const scale = maxEnergy <= 1 ? 100 : 1;
  return points.map((p) => ({
    ...p,
    energy: Math.round(p.energy * scale * 10) / 10,
  }));
};

const normalizeTopGenres = (input) =>
  (Array.isArray(input) ? input : [])
    .map((g) => ({ name: readGenreName(g), count: Number(g?.count ?? g?.trackCount ?? 0) || 0 }))
    .filter((g) => g.name);

/**
 * One radar row per audio feature. Every 0.0 - 1.0 coefficient is multiplied
 * by 100 here, so the radar axis reads as a 0 - 100 percentage scale.
 */
const buildRadarData = (profileA, profileB) =>
  FEATURES.map((f) => ({
    feature: f.label,
    A: profileA ? toPercent(readFeature(profileA, f.key)) : undefined,
    B: profileB ? toPercent(readFeature(profileB, f.key)) : undefined,
  }));

/* ------------------------------------------------------------------ */
/*  Hook: load one genre's audio profile via getGenreData(genre)       */
/* ------------------------------------------------------------------ */

function useGenreProfile(genre) {
  const [state, setState] = useState({ status: 'idle', data: null });

  useEffect(() => {
    if (!genre) {
      setState({ status: 'idle', data: null });
      return undefined;
    }

    let cancelled = false;
    setState({ status: 'loading', data: null });

    (async () => {
      try {
        const res = await trackService.getGenreData(genre);
        if (cancelled) return;
        const profile = extractProfile(unwrap(res));
        setState(profile ? { status: 'ready', data: profile } : { status: 'empty', data: null });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', data: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [genre]);

  return state;
}

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
  page: {
    width: '100%',
    minHeight: '100vh',
    padding: 'clamp(16px, 3vw, 40px)',
    background: C.bg,
    color: C.ink,
    fontFamily: SANS,
    textAlign: 'left',
  },
  shell: { maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 },

  eyebrow: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: C.ink,
    margin: 0,
  },
  title: {
    margin: '10px 0 0',
    color: C.ink,
    fontWeight: 900,
    fontSize: 'clamp(36px, 6vw, 88px)',
    lineHeight: 0.9,
    letterSpacing: '-0.055em',
    textAlign: 'left',
    textTransform: 'none',
  },
  headerRule: { borderBottom: `2px solid ${C.ink}`, paddingBottom: 24 },

  panel: {
    background: C.card,
    border: `2px solid ${C.ink}`,
    boxShadow: `6px 6px 0 ${C.ink}`,
    minWidth: 0,
  },
  panelHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    borderBottom: `2px solid ${C.ink}`,
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
  panelBody: { padding: '20px 20px 16px' },
  chartBox: { width: '100%', height: CHART_HEIGHT, minWidth: 0, position: 'relative' },
  note: {
    margin: '14px 0 0',
    fontSize: 11,
    lineHeight: 1.45,
    letterSpacing: '0.04em',
    color: C.soft,
    textTransform: 'uppercase',
  },
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

  /* Genre DNA */
  dnaControls: {
    padding: 20,
    borderRight: `2px solid ${C.ink}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    minWidth: 0,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' },
  fieldLabel: { display: 'flex', alignItems: 'center', gap: 8, ...labelText },
  select: {
    width: '100%',
    height: 46,
    padding: '0 10px',
    background: C.card,
    color: C.ink,
    border: `2px solid ${C.ink}`,
    borderRadius: 0,
    fontFamily: SANS,
    fontSize: 14,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  fieldStatus: {
    margin: 0,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: C.ink,
  },
  warn: {
    margin: 0,
    padding: '8px 10px',
    border: `2px solid ${C.red}`,
    color: C.red,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 12 },
  th: {
    padding: '8px 6px',
    textAlign: 'right',
    borderBottom: `2px solid ${C.ink}`,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: C.ink,
  },
  thFirst: { textAlign: 'left', paddingLeft: 0 },
  td: {
    padding: '8px 6px',
    textAlign: 'right',
    borderBottom: `1px solid ${C.ink}`,
    fontWeight: 700,
    color: C.ink,
  },
  tdFirst: { textAlign: 'left', paddingLeft: 0, letterSpacing: '0.04em' },
  legend: { display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 8 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 8, ...labelText },

  /* Loading / error */
  stateBox: {
    padding: 'clamp(32px, 6vw, 72px)',
    background: C.card,
    border: `2px solid ${C.ink}`,
    boxShadow: `6px 6px 0 ${C.ink}`,
    fontFamily: MONO,
    fontSize: 'clamp(14px, 1.6vw, 20px)',
    fontWeight: 800,
    letterSpacing: '0.06em',
    color: C.ink,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 20,
  },
  button: {
    height: 44,
    padding: '0 22px',
    background: C.card,
    color: C.ink,
    border: `2px solid ${C.ink}`,
    borderRadius: 0,
    fontFamily: SANS,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
};

const swatch = (color) => ({
  width: 12,
  height: 12,
  background: color,
  border: `2px solid ${C.ink}`,
  display: 'inline-block',
  flexShrink: 0,
});

const chipStyle = {
  padding: '6px 10px',
  background: C.card,
  color: C.ink,
  border: `2px solid ${C.ink}`,
  borderRadius: 0,
  fontFamily: SANS,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  maxWidth: '100%',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const axisTick = { fontFamily: MONO, fontSize: 11, fontWeight: 700, fill: C.ink };
const axisLabel = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.1em',
  fill: C.ink,
};

/* ------------------------------------------------------------------ */
/*  Small presentational pieces                                        */
/* ------------------------------------------------------------------ */

/** Square, flat tooltip with a hard border. No rounding, no soft shadow. */
function BrutalTooltip({ active, payload, label, render }) {
  if (!active || !payload || payload.length === 0) return null;

  const body = render ? (
    render(payload, label)
  ) : (
    <>
      {label !== undefined && label !== '' && (
        <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
      )}
      {payload.map((p) => (
        <div
          key={p.dataKey ?? p.name}
          style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}
        >
          <span>{p.name}</span>
          <span style={{ fontWeight: 800 }}>
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </>
  );

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
        minWidth: 120,
      }}
    >
      {body}
    </div>
  );
}

/** Flat square marker for the scatter plot. */
function SquareDot({ cx, cy }) {
  if (cx === undefined || cy === undefined || cx === null || cy === null) return null;
  return <rect x={cx - 3} y={cy - 3} width={6} height={6} fill={C.red} fillOpacity={0.72} />;
}

function PanelHeader({ index, title, meta }) {
  return (
    <div style={S.panelHead}>
      <h2 style={S.panelTitle}>
        <span style={S.panelIndex}>{index} //</span>
        {title}
      </h2>
      {meta ? <span style={S.panelMeta}>{meta}</span> : null}
    </div>
  );
}

function EmptyOverlay({ children }) {
  return <div style={S.emptyOverlay}>{children}</div>;
}

/** Status line shown under a Vector select. */
function VectorStatus({ genre, status }) {
  if (!genre) return null;
  if (status === 'loading') return <p style={S.fieldStatus}>Loading profile...</p>;
  if (status === 'error') return <p style={S.warn}>Profile request failed</p>;
  if (status === 'empty') return <p style={S.warn}>No audio profile available for this genre</p>;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MusicDashboard() {
  const [_tempo, setTempo] = useState([]);
  const [topGenres, setTopGenres] = useState([]);
  const [scatter, setScatter] = useState([]);
  const [genreOptions, setGenreOptions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [genreA, setGenreA] = useState('');
  const [genreB, setGenreB] = useState('');

  const vectorA = useGenreProfile(genreA);
  const vectorB = useGenreProfile(genreB);

  /* Bounded Feature Distribution states */
  const [distFeature, setDistFeature] = useState('tempo');
  const [distBins, setDistBins] = useState(8);
  const [distGenre, setDistGenre] = useState('');
  const [distData, setDistData] = useState([]);
  const [distSummary, setDistSummary] = useState(null);
  const [distTotal, setDistTotal] = useState(0);
  const [distLoading, setDistLoading] = useState(false);
  const [distError, setDistError] = useState(null);

  /* Bounded Multi-Genre Comparison states */
  const [compGenres, setCompGenres] = useState(['pop', 'rock', 'hip-hop']);
  const [compMetrics, setCompMetrics] = useState([
    'popularity',
    'danceability',
    'energy',
    'valence',
    'acousticness',
  ]);
  const [compData, setCompData] = useState([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState(null);
  const [compWarning, setCompWarning] = useState(null);

  /* Fetch bounded feature distribution whenever controls change */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setDistLoading(true);
      setDistError(null);
      try {
        const res = await trackService.getFeatureDistribution({
          feature: distFeature,
          bins: distBins,
          genre: distGenre || undefined,
        });
        if (cancelled) return;
        const body = unwrap(res);
        setDistData(body?.data ?? []);
        setDistSummary(body?.summary ?? null);
        setDistTotal(body?.totalTracks ?? 0);
      } catch (err) {
        if (cancelled) return;
        setDistData([]);
        setDistSummary(null);
        setDistTotal(0);
        setDistError(err?.response?.data?.message || err?.message || 'Failed to load distribution');
      } finally {
        if (!cancelled) setDistLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [distFeature, distBins, distGenre]);

  /* Fetch multi-genre comparison whenever genres or metrics change */
  useEffect(() => {
    if (compGenres.length === 0) {
      setCompData([]);
      setCompError(null);
      setCompWarning(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setCompLoading(true);
      setCompError(null);
      setCompWarning(null);
      try {
        const res = await trackService.getGenreComparison({
          genres: compGenres.join(','),
          metrics: compMetrics.join(','),
        });
        if (cancelled) return;
        const body = unwrap(res);
        setCompData(body?.data ?? []);
        if (body?.missingGenres && body.missingGenres.length > 0) {
          setCompWarning(`Unrecognized genre(s): ${body.missingGenres.join(', ')}`);
        }
      } catch (err) {
        if (cancelled) return;
        setCompData([]);
        setCompError(err?.response?.data?.message || err?.message || 'Comparison request failed');
      } finally {
        if (!cancelled) setCompLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [compGenres, compMetrics]);

  const addCompGenre = (genre) => {
    if (!genre) return;
    if (compGenres.includes(genre)) return;
    if (compGenres.length >= 5) {
      setCompWarning('Maximum 5 genres allowed for comparison');
      return;
    }
    setCompWarning(null);
    setCompGenres([...compGenres, genre]);
  };

  const removeCompGenre = (genre) => {
    setCompWarning(null);
    setCompGenres(compGenres.filter((g) => g !== genre));
  };

  const toggleCompMetric = (metric) => {
    if (compMetrics.includes(metric)) {
      if (compMetrics.length <= 1) return;
      setCompMetrics(compMetrics.filter((m) => m !== metric));
    } else {
      setCompMetrics([...compMetrics, metric]);
    }
  };

  /* Fetch dashboard metrics + genre list on mount (and on retry). */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const [metricsResult, genresResult] = await Promise.allSettled([
        trackService.getDashboardMetrics(),
        trackService.getGenres(),
      ]);
      if (cancelled) return;

      if (metricsResult.status === 'rejected') {
        setTempo([]);
        setTopGenres([]);
        setScatter([]);
        setError(metricsResult.reason?.message || 'Request failed');
        setLoading(false);
        return;
      }

      const responseBody = unwrap(metricsResult.value) ?? {};
      const metrics = responseBody.data ?? responseBody;
      const top = normalizeTopGenres(metrics.topGenres);

      /* Genre list from the API (strings or objects). Falls back to topGenres. */
      let listed = [];
      if (genresResult.status === 'fulfilled') {
        const body = unwrap(genresResult.value);
        const arr = Array.isArray(body) ? body : body?.genres ?? body?.data ?? [];
        listed = Array.isArray(arr) ? arr : [];
      }

      const names = Array.from(
        new Set([...listed.map(readGenreName), ...top.map((g) => g.name)].filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b));

      setTempo(normalizeTempo(metrics.tempoDistribution));
      setTopGenres(top);
      setScatter(normalizeScatter(metrics.scatterSample));
      setGenreOptions(names);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /* Loading and error states */
  if (loading) {
    return (
      <div className="md-root" style={S.page}>
        <style>{GLOBAL_CSS}</style>
        <div style={S.shell}>
          <div style={S.stateBox} role="status" aria-live="polite">
            ⏳ PARSING MACRO METRIC MATRICES FROM POSTGRESQL...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="md-root" style={S.page}>
        <style>{GLOBAL_CSS}</style>
        <div style={S.shell}>
          <div style={S.stateBox} role="alert">
            <span>METRICS UNAVAILABLE ({String(error).slice(0, 100).toUpperCase()})</span>
            <button
              type="button"
              className="md-btn md-focus"
              style={S.button}
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* Derived values */
  const profileA = vectorA.status === 'ready' ? vectorA.data : null;
  const profileB = vectorB.status === 'ready' ? vectorB.data : null;
  const radarData = buildRadarData(profileA, profileB);

  const compChartData = compMetrics
    .filter((m) => m !== 'track_count')
    .map((m) => {
      const metricConfig = COMP_METRICS_LIST.find((cm) => cm.key === m);
      const row = {
        metric: metricConfig?.label || m.toUpperCase(),
      };
      for (const entry of compData) {
        let val = entry[m];
        if (typeof val === 'number') {
          if (m !== 'tempo' && m !== 'popularity') {
            val = Math.round(val * 1000) / 10;
          }
        }
        row[entry.genre] = val;
      }
      return row;
    });

  const pickGenre = (name) => {
    if (!genreA) setGenreA(name);
    else setGenreB(name);
  };

  const fmtCell = (value) => (value === undefined ? '--' : value.toFixed(1));

  return (
    <div className="md-root" style={S.page}>
      <style>{GLOBAL_CSS}</style>

      <div style={S.shell}>
        {/* Header */}
        <header style={S.headerRule}>
          <p style={S.eyebrow}>Spotify Music Intelligence / Audio analytics</p>
          <h1 style={S.title}>
            Music
            <br />
            Dashboard
          </h1>
        </header>

        {/* Charts 1 + 2 */}
        <div className="md-two">
          <section style={S.panel} aria-label="Feature distributions histogram">
            <PanelHeader
              index="01"
              title="Feature distribution"
              meta={`${distTotal.toLocaleString()} TRACKS • ${distFeature.toUpperCase()}`}
            />
            <div
              style={{
                padding: '12px 20px',
                borderBottom: `2px solid ${C.ink}`,
                background: C.card,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label htmlFor="md-dist-feature" style={{ ...labelText, fontSize: 10 }}>
                    Feature:
                  </label>
                  <select
                    id="md-dist-feature"
                    className="md-focus"
                    value={distFeature}
                    onChange={(e) => setDistFeature(e.target.value)}
                    style={{ ...S.select, height: 32, width: 140, fontSize: 12, fontWeight: 700 }}
                  >
                    {DIST_FEATURES.map((df) => (
                      <option key={df.key} value={df.key}>
                        {df.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label htmlFor="md-dist-bins" style={{ ...labelText, fontSize: 10 }}>
                    Bins:
                  </label>
                  <select
                    id="md-dist-bins"
                    className="md-focus"
                    value={distBins}
                    onChange={(e) => setDistBins(parseInt(e.target.value, 10))}
                    style={{ ...S.select, height: 32, width: 90, fontSize: 12, fontWeight: 700 }}
                  >
                    <option value={5}>5 Bins</option>
                    <option value={8}>8 Bins</option>
                    <option value={10}>10 Bins</option>
                    <option value={15}>15 Bins</option>
                    <option value={20}>20 Bins</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label htmlFor="md-dist-genre" style={{ ...labelText, fontSize: 10 }}>
                    Genre:
                  </label>
                  <select
                    id="md-dist-genre"
                    className="md-focus"
                    value={distGenre}
                    onChange={(e) => setDistGenre(e.target.value)}
                    style={{ ...S.select, height: 32, width: 140, fontSize: 12, fontWeight: 700 }}
                  >
                    <option value="">All genres</option>
                    {genreOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {distSummary && (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.soft,
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <span>AVG: {distSummary.avg_value}</span>
                  <span>MIN: {distSummary.min_value}</span>
                  <span>MAX: {distSummary.max_value}</span>
                </div>
              )}
            </div>

            <div style={S.panelBody}>
              <div style={S.chartBox}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={distData}
                    barCategoryGap="6%"
                    margin={{ top: 8, right: 8, bottom: 24, left: 0 }}
                  >
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={axisTick}
                      stroke={C.ink}
                      tickLine={false}
                      minTickGap={8}
                      label={{
                        value: `${distFeature.toUpperCase()} BUCKET`,
                        position: 'insideBottom',
                        offset: -14,
                        style: axisLabel,
                      }}
                    />
                    <YAxis
                      tick={axisTick}
                      stroke={C.ink}
                      tickLine={false}
                      width={52}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(217, 56, 58, 0.12)' }}
                      content={
                        <BrutalTooltip
                          render={(payload, label) => {
                            const p = payload[0]?.payload || {};
                            return (
                              <div>
                                <div style={{ fontWeight: 800, marginBottom: 4 }}>{label}</div>
                                <div>
                                  TRACKS:{' '}
                                  {typeof p.count === 'number'
                                    ? p.count.toLocaleString()
                                    : p.count}
                                </div>
                                {p.percentage != null && <div>SHARE: {p.percentage}%</div>}
                              </div>
                            );
                          }}
                        />
                      }
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
                {distError ? (
                  <EmptyOverlay>Error loading distribution: {distError}</EmptyOverlay>
                ) : distData.length === 0 ? (
                  <EmptyOverlay>
                    {distLoading ? 'Calculating distribution...' : 'No tracks match this selection'}
                  </EmptyOverlay>
                ) : null}
              </div>
            </div>
          </section>

          <section style={S.panel} aria-label="Popularity versus energy">
            <PanelHeader
              index="02"
              title="Popularity vs. energy"
              meta={`${scatter.length.toLocaleString()} TRACKS`}
            />
            <div style={S.panelBody}>
              <div style={S.chartBox}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
                    <CartesianGrid stroke={C.grid} />
                    <XAxis
                      type="number"
                      dataKey="energy"
                      name="Energy"
                      domain={[0, 100]}
                      tick={axisTick}
                      stroke={C.ink}
                      tickLine={false}
                      label={{ value: 'ENERGY', position: 'insideBottom', offset: -14, style: axisLabel }}
                    />
                    <YAxis
                      type="number"
                      dataKey="popularity"
                      name="Popularity"
                      domain={[0, 100]}
                      tick={axisTick}
                      stroke={C.ink}
                      tickLine={false}
                      width={44}
                      label={{ value: 'POPULARITY', angle: -90, position: 'insideLeft', offset: 14, style: axisLabel }}
                    />
                    <Tooltip
                      cursor={{ stroke: C.ink, strokeDasharray: '4 4' }}
                      content={
                        <BrutalTooltip
                          render={(payload) => {
                            const point = payload[0]?.payload ?? {};
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {point.name ? (
                                  <div
                                    style={{
                                      fontWeight: 800,
                                      maxWidth: 220,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {point.name}
                                  </div>
                                ) : null}
                                <div>ENERGY: {point.energy}</div>
                                <div>POPULARITY: {point.popularity}</div>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Scatter data={scatter} shape={<SquareDot />} isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
                {scatter.length === 0 && <EmptyOverlay>No scatter sample returned</EmptyOverlay>}
              </div>
              <p style={S.note}>
                Metadata note: this graph measures architectural correlation metrics between energy
                and popularity. It does not establish direct popularity causality.
              </p>
            </div>
          </section>
        </div>

        {/* Chart 3: Interactive Genre DNA Profiling */}
        <section style={S.panel} aria-label="Interactive genre DNA profiling">
          <PanelHeader index="03" title="Interactive genre DNA profiling" meta="SCALE 0 - 100" />

          <div className="md-dna">
            {/* Controls + values table */}
            <div className="md-dna-controls" style={S.dnaControls}>
              <div style={S.field}>
                <label htmlFor="md-vector-a" style={S.fieldLabel}>
                  <span style={swatch(C.ink)} />
                  Vector A
                </label>
                <select
                  id="md-vector-a"
                  className="md-focus"
                  value={genreA}
                  onChange={(e) => setGenreA(e.target.value)}
                  style={S.select}
                >
                  <option value="">Select genre</option>
                  {genreOptions.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <VectorStatus genre={genreA} status={vectorA.status} />
              </div>

              <div style={S.field}>
                <label htmlFor="md-vector-b" style={S.fieldLabel}>
                  <span style={swatch(C.red)} />
                  Vector B (optional)
                </label>
                <select
                  id="md-vector-b"
                  className="md-focus"
                  value={genreB}
                  onChange={(e) => setGenreB(e.target.value)}
                  style={S.select}
                >
                  <option value="">None</option>
                  {genreOptions.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <VectorStatus genre={genreB} status={vectorB.status} />
              </div>

              {topGenres.length > 0 && (
                <div style={S.field}>
                  <span style={labelText}>Top genres / click to load</span>
                  <div style={S.chipRow}>
                    {topGenres.slice(0, 8).map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        className="md-chip md-focus"
                        style={chipStyle}
                        title={g.name}
                        onClick={() => pickGenre(g.name)}
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, ...S.thFirst }}>Feature</th>
                    <th style={S.th}>A</th>
                    <th style={{ ...S.th, color: C.red }}>B</th>
                  </tr>
                </thead>
                <tbody>
                  {radarData.map((row) => (
                    <tr key={row.feature}>
                      <td style={{ ...S.td, ...S.tdFirst }}>{row.feature}</td>
                      <td style={S.td}>{fmtCell(row.A)}</td>
                      <td style={{ ...S.td, color: row.B === undefined ? C.ink : C.red }}>
                        {fmtCell(row.B)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Radar */}
            <div style={{ ...S.panelBody, minWidth: 0 }}>
              <div style={{ ...S.chartBox, height: 460 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={radarData}
                    outerRadius="72%"
                    margin={{ top: 16, right: 40, bottom: 16, left: 40 }}
                  >
                    <PolarGrid stroke={C.ink} strokeOpacity={0.25} />
                    <PolarAngleAxis dataKey="feature" tick={{ ...axisTick, fontSize: 12 }} />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tickCount={5}
                      tick={{ ...axisTick, fontSize: 10 }}
                      stroke={C.ink}
                      strokeOpacity={0.4}
                    />
                    {profileA && (
                      <Radar
                        name={genreA}
                        dataKey="A"
                        stroke={C.ink}
                        strokeWidth={2.5}
                        fill={C.ink}
                        fillOpacity={0.08}
                        isAnimationActive={false}
                      />
                    )}
                    {profileB && (
                      <Radar
                        name={genreB}
                        dataKey="B"
                        stroke={C.red}
                        strokeWidth={2.5}
                        fill={C.red}
                        fillOpacity={0.3}
                        isAnimationActive={false}
                      />
                    )}
                    <Tooltip
                      content={
                        <BrutalTooltip
                          render={(payload) => (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ fontWeight: 800 }}>{payload[0]?.payload?.feature}</div>
                              {payload.map((p) => (
                                <div
                                  key={p.dataKey}
                                  style={{ color: p.dataKey === 'B' ? C.red : C.ink }}
                                >
                                  {p.name}: {Number(p.value).toFixed(1)}
                                </div>
                              ))}
                            </div>
                          )}
                        />
                      }
                    />
                  </RadarChart>
                </ResponsiveContainer>
                {!profileA && !profileB && (
                  <EmptyOverlay>
                    {vectorA.status === 'loading' || vectorB.status === 'loading'
                      ? 'Loading genre profile...'
                      : 'Select Vector A to plot a genre profile'}
                  </EmptyOverlay>
                )}
              </div>

              <div style={S.legend}>
                <span style={S.legendItem}>
                  <span style={swatch(C.ink)} />
                  {profileA ? genreA : 'Vector A'}
                </span>
                <span style={S.legendItem}>
                  <span style={swatch(C.red)} />
                  {profileB ? genreB : 'Vector B'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 04: Multi-Genre Comparison Matrix */}
        <section style={S.panel} aria-label="Multi-genre comparative matrix">
          <PanelHeader
            index="04"
            title="Multi-genre comparison matrix"
            meta={`${compGenres.length} OF 5 GENRES SELECTED`}
          />

          <div
            style={{
              padding: '16px 20px',
              borderBottom: `2px solid ${C.ink}`,
              background: C.card,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {/* Top row: Genre chips, Add dropdown, presets */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={labelText}>Active Genres:</span>
                {compGenres.map((g, idx) => (
                  <span
                    key={g}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      background: C.card,
                      border: `2px solid ${GENRE_COLORS[idx % GENRE_COLORS.length]}`,
                      color: C.ink,
                      fontFamily: MONO,
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                    }}
                  >
                    <span style={swatch(GENRE_COLORS[idx % GENRE_COLORS.length])} />
                    {g}
                    <button
                      type="button"
                      className="md-focus"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.red,
                        cursor: 'pointer',
                        fontWeight: 900,
                        padding: '0 2px',
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                      onClick={() => removeCompGenre(g)}
                      title={`Remove ${g}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}

                {compGenres.length < 5 ? (
                  <select
                    className="md-focus"
                    value=""
                    onChange={(e) => addCompGenre(e.target.value)}
                    style={{ ...S.select, height: 32, width: 140, fontSize: 11, fontWeight: 700 }}
                  >
                    <option value="">+ Add genre...</option>
                    {genreOptions
                      .filter((g) => !compGenres.includes(g))
                      .map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.soft, fontWeight: 700 }}>
                    (MAX 5 REACHED)
                  </span>
                )}

                {compGenres.length > 0 && (
                  <button
                    type="button"
                    className="md-focus"
                    style={{
                      background: 'none',
                      border: `1px solid ${C.ink}`,
                      padding: '4px 8px',
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                    }}
                    onClick={() => setCompGenres([])}
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Presets */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ ...labelText, fontSize: 10 }}>Presets:</span>
                <button
                  type="button"
                  className="md-chip md-focus"
                  style={{ ...chipStyle, fontSize: 10, padding: '4px 8px' }}
                  onClick={() => setCompGenres(['pop', 'rock', 'classical'])}
                >
                  Pop / Rock / Classical
                </button>
                <button
                  type="button"
                  className="md-chip md-focus"
                  style={{ ...chipStyle, fontSize: 10, padding: '4px 8px' }}
                  onClick={() => setCompGenres(['hip-hop', 'dance', 'electronic'])}
                >
                  Hip-Hop / Dance / Electronic
                </button>
                {topGenres.length >= 3 && (
                  <button
                    type="button"
                    className="md-chip md-focus"
                    style={{ ...chipStyle, fontSize: 10, padding: '4px 8px' }}
                    onClick={() => setCompGenres(topGenres.slice(0, 3).map((g) => g.name))}
                  >
                    Top 3
                  </button>
                )}
              </div>
            </div>

            {/* Metrics toggle row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={labelText}>Compare Metrics:</span>
              {COMP_METRICS_LIST.map((m) => {
                const active = compMetrics.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    className="md-focus"
                    style={{
                      padding: '4px 10px',
                      background: active ? C.ink : C.card,
                      color: active ? C.card : C.ink,
                      border: `2px solid ${C.ink}`,
                      borderRadius: 0,
                      fontFamily: MONO,
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleCompMetric(m.key)}
                  >
                    {active ? '✓ ' : '+ '}
                    {m.label}
                  </button>
                );
              })}
            </div>

            {compWarning && <p style={{ ...S.warn, margin: 0 }}>{compWarning}</p>}
          </div>

          <div style={S.panelBody}>
            {compGenres.length === 0 ? (
              <div
                style={{
                  ...S.chartBox,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <EmptyOverlay>
                  Select 1 to 5 genres above to generate comparative analytics
                </EmptyOverlay>
              </div>
            ) : compError ? (
              <div
                style={{
                  ...S.chartBox,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <EmptyOverlay>
                  <span>{compError}</span>
                  <button
                    type="button"
                    className="md-btn md-focus"
                    style={{ ...S.button, marginTop: 12 }}
                    onClick={() => setCompGenres(['pop', 'rock', 'hip-hop'])}
                  >
                    Reset to Default Genres
                  </button>
                </EmptyOverlay>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 24,
                  opacity: compLoading ? 0.6 : 1,
                  transition: 'opacity 150ms ease',
                }}
              >
                {/* Two side-by-side charts: Metrics BarChart & Track Volume BarChart */}
                <div className="md-two">
                  <div>
                    <h3 style={{ ...S.panelTitle, fontSize: 12, marginBottom: 10 }}>
                      Audio Feature Metrics Comparison
                    </h3>
                    <div style={{ ...S.chartBox, height: 320 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={compChartData}
                          margin={{ top: 12, right: 16, bottom: 24, left: 0 }}
                          barCategoryGap="16%"
                        >
                          <CartesianGrid stroke={C.grid} vertical={false} />
                          <XAxis dataKey="metric" tick={axisTick} stroke={C.ink} tickLine={false} />
                          <YAxis tick={axisTick} stroke={C.ink} tickLine={false} width={44} />
                          <Tooltip content={<BrutalTooltip />} />
                          <Legend
                            wrapperStyle={{
                              fontFamily: MONO,
                              fontSize: 11,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '0.08em',
                              paddingTop: 8,
                            }}
                          />
                          {compData.map((genreEntry, idx) => (
                            <Bar
                              key={genreEntry.genre}
                              dataKey={genreEntry.genre}
                              name={genreEntry.genre}
                              fill={GENRE_COLORS[idx % GENRE_COLORS.length]}
                              radius={0}
                              isAnimationActive={false}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h3 style={{ ...S.panelTitle, fontSize: 12, marginBottom: 10 }}>
                      Track Volume per Genre
                    </h3>
                    <div style={{ ...S.chartBox, height: 320 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={compData.map((d) => ({
                            genre: d.genre,
                            track_count: d.track_count,
                          }))}
                          margin={{ top: 12, right: 16, bottom: 24, left: 0 }}
                          barCategoryGap="20%"
                        >
                          <CartesianGrid stroke={C.grid} vertical={false} />
                          <XAxis dataKey="genre" tick={axisTick} stroke={C.ink} tickLine={false} />
                          <YAxis
                            tick={axisTick}
                            stroke={C.ink}
                            tickLine={false}
                            width={52}
                            allowDecimals={false}
                          />
                          <Tooltip content={<BrutalTooltip />} />
                          <Bar
                            dataKey="track_count"
                            name="Track Count"
                            fill={C.ink}
                            radius={0}
                            isAnimationActive={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Data Table */}
                <div style={{ overflowX: 'auto', border: `2px solid ${C.ink}` }}>
                  <table style={S.table}>
                    <thead>
                      <tr style={{ background: C.card }}>
                        <th style={{ ...S.th, ...S.thFirst, padding: '10px 12px' }}>Genre</th>
                        <th style={{ ...S.th, padding: '10px 12px' }}>Track Count</th>
                        {compMetrics.map((m) => (
                          <th key={m} style={{ ...S.th, padding: '10px 12px' }}>
                            {m.toUpperCase()}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compData.map((row, idx) => (
                        <tr key={row.genre} style={{ borderBottom: `1px solid ${C.ink}` }}>
                          <td
                            style={{
                              ...S.td,
                              ...S.thFirst,
                              padding: '10px 12px',
                              fontWeight: 800,
                            }}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span style={swatch(GENRE_COLORS[idx % GENRE_COLORS.length])} />
                              {row.genre}
                            </span>
                          </td>
                          <td
                            style={{
                              ...S.td,
                              padding: '10px 12px',
                              fontFamily: MONO,
                              fontWeight: 800,
                            }}
                          >
                            {row.track_count.toLocaleString()}
                          </td>
                          {compMetrics.map((m) => {
                            const val = row[m];
                            const formatted =
                              val == null
                                ? '--'
                                : m !== 'tempo' && m !== 'popularity'
                                  ? `${Math.round(val * 1000) / 10}%`
                                  : val.toFixed(1);
                            return (
                              <td
                                key={m}
                                style={{ ...S.td, padding: '10px 12px', fontFamily: MONO }}
                              >
                                {formatted}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
