import { useState, useEffect } from 'react';
import { trackService } from '../services/api';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 5;
const DEBOUNCE_MS = 300;
const MAX_TEXT_LENGTH = 80;
const QUICK_GENRES = 8;

const C = {
  bg: '#EFEFEA',
  card: '#FFFFFF',
  ink: '#000000',
  red: '#D9383A',
  soft: 'rgba(0, 0, 0, 0.6)',
  ghost: 'rgba(0, 0, 0, 0.05)',
};

const SANS = '"Helvetica Neue", Helvetica, Arial, "Inter", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';

/* Keyframes, media queries, hover and focus states cannot be written inline. */
const GLOBAL_CSS = `
  .mx-root, .mx-root * { box-sizing: border-box; }
  @keyframes mx-spin { to { transform: rotate(360deg); } }
  .mx-record { animation: mx-spin 6s linear infinite; }
  .mx-focus:focus-visible { outline: 3px solid ${C.red}; outline-offset: 2px; }
  .mx-btn:not(:disabled):hover { background: ${C.ink}; color: ${C.card}; }
  .mx-chip:hover { background: ${C.red}; border-color: ${C.red}; color: ${C.card}; }
  .mx-strip { transition: transform 120ms ease, background 120ms ease; }
  .mx-main {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 32px;
  }
  .mx-deck-body { margin-left: calc(var(--vs) * 0.42 + 32px); }
  @media (max-width: 900px) {
    .mx-main { grid-template-columns: minmax(0, 1fr); }
    .mx-deck { min-height: 460px; --vs: 340px !important; }
  }
  @media (max-width: 600px) {
    .mx-deck { --vs: 260px !important; }
    .mx-vinyl-anchor { opacity: 0.16; }
    .mx-deck-body { margin-left: 20px !important; }
    .mx-hide-sm { display: none !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mx-record { animation: none; }
    .mx-strip { transition: none; }
  }
`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Integer milliseconds -> "MM:SS". Returns "--:--" for invalid input. */
const formatDuration = (ms) => {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return '--:--';
  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** Shortens absurdly long strings. Visual overflow is handled by CSS ellipsis. */
const truncate = (text, max = MAX_TEXT_LENGTH) => {
  const clean = String(text ?? '').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

const pad2 = (n) => String(n).padStart(2, '0');

/** Deterministic bar heights (0-100) so every track gets its own stable waveform. */
const waveform = (seed, count = 56) => {
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars = [];
  for (let i = 0; i < count; i += 1) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const r = (h >>> 0) / 4294967295;
    const envelope = 0.35 + 0.65 * Math.sin((i / (count - 1)) * Math.PI);
    bars.push(Math.max(8, Math.round((0.2 + 0.8 * r) * envelope * 100)));
  }
  return bars;
};

const formatArtists = (value) => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value.replace(/;\s*/g, ', ');
  return 'Unknown artist';
};

/** Maps whatever the API returns onto the fields this UI needs. */
const normalizeTrack = (raw, index) => {
  const title = raw.track_name ?? raw.name ?? raw.title ?? 'Untitled';
  return {
    id: raw.id ?? raw.track_id ?? `${title}-${index}`,
    title,
    artist: formatArtists(raw.artists ?? raw.artist_name ?? raw.artist),
    genre: raw.track_genre ?? raw.genre ?? 'Unclassified',
    durationMs: raw.duration_ms,
    album: raw.album_name,
    popularity: raw.popularity != null ? Number(raw.popularity) : null,
    danceability: raw.danceability != null ? Number(raw.danceability) : null,
    energy: raw.energy != null ? Number(raw.energy) : null,
    valence: raw.valence != null ? Number(raw.valence) : null,
    acousticness: raw.acousticness != null ? Number(raw.acousticness) : null,
    tempo: raw.tempo != null ? Number(raw.tempo) : null,
    matchScore: raw.match_score != null ? Number(raw.match_score) : null,
  };
};

const unwrap = (res) => {
  const isAxios = res && typeof res === 'object' && res.status !== undefined && res.headers;
  return isAxios ? res.data : res;
};

/** Accepts a bare array, { tracks | data | items | results }, or an Axios response. */
const parseTracksResponse = (res) => {
  const body = unwrap(res);
  const list = Array.isArray(body)
    ? body
    : body?.tracks ?? body?.data ?? body?.items ?? body?.results ?? [];

  const total = body?.total ?? body?.totalCount ?? body?.count ?? null;
  const totalPages =
    body?.totalPages ??
    body?.total_pages ??
    (typeof total === 'number' ? Math.ceil(total / PAGE_SIZE) : null);

  return {
    tracks: (Array.isArray(list) ? list : []).map(normalizeTrack),
    total: typeof total === 'number' ? total : null,
    totalPages,
  };
};

const parseGenresResponse = (res) => {
  const body = unwrap(res);
  const list = Array.isArray(body) ? body : body?.genres ?? body?.data ?? [];
  return (Array.isArray(list) ? list : [])
    .map((g) => (typeof g === 'string' ? g : g?.name ?? g?.genre ?? ''))
    .filter(Boolean);
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const label = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: C.ink,
};

const S = {
  /* Fixed to the viewport so parent containers (App.css, #root) can't constrain it. */
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'grid',
    gridTemplateRows: 'auto auto minmax(560px, 1fr) auto',
    background: C.bg,
    color: C.ink,
    fontFamily: SANS,
    textAlign: 'left',
    overflowX: 'hidden',
    overflowY: 'auto',
  },

  /* Top bar */
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    padding: '10px clamp(16px, 2.5vw, 40px)',
    background: C.ink,
    color: C.card,
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  status: { display: 'flex', alignItems: 'center', gap: 8 },

  /* Header */
  header: {
    padding: 'clamp(16px, 2.5vw, 32px) clamp(16px, 2.5vw, 40px) 20px',
    borderBottom: `2px solid ${C.ink}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  headerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 24,
  },
  title: {
    margin: 0,
    color: C.ink,
    fontWeight: 900,
    fontSize: 'clamp(36px, 6vw, 92px)',
    lineHeight: 0.88,
    letterSpacing: '-0.055em',
    textTransform: 'none',
    textAlign: 'left',
  },
  subtitle: { margin: '14px 0 0', fontSize: 15, color: C.soft, textAlign: 'left' },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' },
  input: {
    width: 280,
    maxWidth: '100%',
    height: 48,
    padding: '0 14px',
    background: C.card,
    color: C.ink,
    border: `2px solid ${C.ink}`,
    borderRadius: 0,
    boxShadow: `4px 4px 0 ${C.ink}`,
    fontFamily: SANS,
    fontSize: 16,
  },
  select: {
    width: 220,
    maxWidth: '100%',
    height: 48,
    padding: '0 10px',
    background: C.card,
    color: C.ink,
    border: `2px solid ${C.ink}`,
    borderRadius: 0,
    boxShadow: `4px 4px 0 ${C.ink}`,
    fontFamily: SANS,
    fontSize: 16,
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },

  /* Main */
  main: { padding: 'clamp(16px, 2.5vw, 32px) clamp(16px, 2.5vw, 40px)', minHeight: 0 },

  /* Deck */
  deck: {
    '--vs': 'clamp(320px, 74vh, 760px)',
    position: 'relative',
    overflow: 'hidden',
    minHeight: 0,
    background: C.card,
    border: `2px solid ${C.ink}`,
    boxShadow: `8px 8px 0 ${C.ink}`,
    display: 'flex',
    alignItems: 'stretch',
  },
  bigIndex: {
    position: 'absolute',
    right: 20,
    top: 4,
    fontWeight: 900,
    fontSize: 'clamp(100px, 16vw, 260px)',
    lineHeight: 1,
    letterSpacing: '-0.06em',
    color: C.ghost,
    pointerEvents: 'none',
    userSelect: 'none',
  },
  vinylAnchor: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: 'var(--vs)',
    height: 'var(--vs)',
    transform: 'translate(-58%, -50%)',
    pointerEvents: 'none',
  },
  vinyl: {
    position: 'relative',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    background: `
      conic-gradient(from 0deg, transparent 0 18%, rgba(255,255,255,0.16) 24%, transparent 30% 68%, rgba(255,255,255,0.16) 74%, transparent 80%),
      repeating-radial-gradient(circle at center, #000 0, #000 2px, #1d1d1d 3px, #000 4px)
    `,
    boxShadow: `0 0 0 2px ${C.ink}`,
  },
  vinylRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '46%',
    height: '46%',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.35)',
  },
  vinylLabel: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '34%',
    height: '34%',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    background: C.red,
    border: `3px solid ${C.ink}`,
  },
  vinylHole: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 16,
    height: 16,
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    background: C.card,
    border: `2px solid ${C.ink}`,
  },
  deckBody: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    padding: 'clamp(20px, 2.5vw, 36px) clamp(20px, 2.5vw, 36px) clamp(20px, 2.5vw, 36px) 0',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 24,
  },
  badgeRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  badgeRed: {
    padding: '6px 12px',
    background: C.red,
    color: C.card,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  badgeLine: {
    padding: '5px 12px',
    border: `2px solid ${C.ink}`,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    maxWidth: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  artist: {
    margin: 0,
    color: C.ink,
    fontWeight: 900,
    fontSize: 'clamp(44px, 7.2vw, 128px)',
    lineHeight: 0.86,
    letterSpacing: '-0.06em',
    textTransform: 'none',
    textAlign: 'left',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  songTitle: {
    margin: '18px 0 0',
    color: C.ink,
    fontSize: 'clamp(18px, 1.8vw, 26px)',
    fontWeight: 600,
    lineHeight: 1.2,
    textAlign: 'left',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  wave: { display: 'flex', alignItems: 'flex-end', gap: 3, height: 72 },
  meta: {
    margin: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    borderTop: `2px solid ${C.ink}`,
  },
  metaCell: { padding: '14px 12px 0 0', minWidth: 0 },
  metaTerm: { margin: 0, ...label },
  metaGenre: {
    margin: '8px 0 0',
    fontSize: 20,
    fontWeight: 800,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  metaMono: { margin: '8px 0 0', fontFamily: MONO, fontSize: 30, fontWeight: 800, lineHeight: 1 },

  /* Right column */
  right: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, minHeight: 0 },
  rightHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  rightTitle: {
    margin: 0,
    color: C.ink,
    fontSize: 'clamp(22px, 2.2vw, 32px)',
    fontWeight: 900,
    letterSpacing: '-0.04em',
    textTransform: 'none',
    textAlign: 'left',
  },
  rightCount: { fontFamily: MONO, fontSize: 13, fontWeight: 700, color: C.ink },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    background: C.card,
    border: `2px solid ${C.ink}`,
    boxShadow: `8px 8px 0 ${C.ink}`,
  },
  statusBox: {
    flex: 1,
    padding: 28,
    border: `2px solid ${C.ink}`,
    background: C.card,
    boxShadow: `8px 8px 0 ${C.ink}`,
    fontSize: 16,
    lineHeight: 1.4,
    color: C.ink,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 16,
    textAlign: 'left',
  },
  pager: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  pagerInfo: { fontFamily: MONO, fontWeight: 800, fontSize: 15, color: C.ink },
  pagerButtons: { display: 'flex', gap: 10 },
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
  buttonDisabled: { opacity: 0.3, cursor: 'not-allowed' },

  /* Footer */
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    padding: '10px clamp(16px, 2.5vw, 40px)',
    background: C.ink,
    color: C.card,
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
};

const dot = (color) => ({ width: 10, height: 10, background: color, display: 'inline-block' });

const chipStyle = (active) => ({
  padding: '7px 14px',
  background: active ? C.ink : C.card,
  color: active ? C.card : C.ink,
  border: `2px solid ${C.ink}`,
  borderRadius: 0,
  fontFamily: SANS,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
});

const stripStyle = (active, last) => ({
  flex: 1,
  minHeight: 84,
  display: 'grid',
  gridTemplateColumns: '72px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 16,
  padding: '12px 20px 12px 14px',
  background: active ? C.ink : C.card,
  color: active ? C.card : C.ink,
  borderBottom: last ? 'none' : `2px solid ${C.ink}`,
  borderLeft: `10px solid ${active ? C.red : 'transparent'}`,
  transform: active ? 'translateX(-6px)' : 'none',
  cursor: 'default',
  outline: 'none',
});

const ellipsis = {
  display: 'block',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MusicExplorer() {
  const [genres, setGenres] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [total, setTotal] = useState(null);
  const [totalPages, setTotalPages] = useState(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeId, setActiveId] = useState(null);

  /* Recommendation mode states */
  const [activeTab, setActiveTab] = useState('tracks'); // 'tracks' | 'recommendations'
  const [recSeedTrack, setRecSeedTrack] = useState(null);
  const [recFeatures, setRecFeatures] = useState({
    danceability: 0.65,
    energy: 0.7,
    valence: 0.55,
    acousticness: 0.2,
    tempo: 120,
  });
  const [recGenre, setRecGenre] = useState('');
  const [recTracks, setRecTracks] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState(null);

  const fetchRecommendations = async (customParams = {}) => {
    setRecLoading(true);
    setRecError(null);
    try {
      const params = {
        limit: 10,
        ...customParams,
      };

      if (!params.track_id) {
        if (params.danceability === undefined) params.danceability = recFeatures.danceability;
        if (params.energy === undefined) params.energy = recFeatures.energy;
        if (params.valence === undefined) params.valence = recFeatures.valence;
        if (params.acousticness === undefined) params.acousticness = recFeatures.acousticness;
        if (params.tempo === undefined) params.tempo = recFeatures.tempo;
      }

      if (recGenre && !params.genre) {
        params.genre = recGenre;
      }

      const res = await trackService.getRecommendations(params);
      const list = res?.data ?? [];
      const parsed = list.map(normalizeTrack);
      setRecTracks(parsed);
      if (parsed.length > 0 && !activeId) {
        setActiveId(parsed[0].id);
      }
    } catch (err) {
      setRecError(err?.response?.data?.message || err?.message || 'Failed to fetch recommendations');
      setRecTracks([]);
    } finally {
      setRecLoading(false);
    }
  };

  const handleExploreSimilar = (track) => {
    if (!track) return;
    setRecSeedTrack(track);
    const updatedFeatures = {
      danceability: track.danceability != null ? Number(track.danceability) : 0.65,
      energy: track.energy != null ? Number(track.energy) : 0.7,
      valence: track.valence != null ? Number(track.valence) : 0.55,
      acousticness: track.acousticness != null ? Number(track.acousticness) : 0.2,
      tempo: track.tempo != null ? Math.round(Number(track.tempo)) : 120,
    };
    setRecFeatures(updatedFeatures);
    setActiveTab('recommendations');
    fetchRecommendations({
      track_id: track.id,
      ...updatedFeatures,
    });
  };

  const handleApplySliders = () => {
    fetchRecommendations({
      track_id: recSeedTrack?.id,
      ...recFeatures,
      genre: recGenre || undefined,
    });
  };

  const handleClearSeed = () => {
    setRecSeedTrack(null);
    fetchRecommendations({
      ...recFeatures,
      genre: recGenre || undefined,
    });
  };

  /* Genres: load once on mount */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await trackService.getGenres();
        if (!cancelled) setGenres(parseGenresResponse(res));
      } catch (err) {
        if (!cancelled) setGenres([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* Tracks: refetch on filter change, debounced by 300ms */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await trackService.getTracks({
          page,
          limit: PAGE_SIZE,
          search: search.trim(),
          genre,
        });
        if (cancelled) return;

        const parsed = parseTracksResponse(res);
        setTracks(parsed.tracks);
        setTotal(parsed.total);
        setTotalPages(parsed.totalPages);
      } catch (err) {
        if (cancelled) return;
        setTracks([]);
        setTotal(null);
        setTotalPages(null);
        setError(err?.message || 'Request failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [page, search, genre, reloadKey]);

  const allKnownTracks = [...tracks, ...recTracks];
  const activeTrack =
    allKnownTracks.find((t) => t.id === activeId) ??
    (activeTab === 'recommendations' ? recTracks[0] ?? tracks[0] : tracks[0] ?? recTracks[0]) ??
    null;
  const isFromTracks = tracks.some((t) => t.id === activeTrack?.id);
  const activeNumber = isFromTracks
    ? (page - 1) * PAGE_SIZE + tracks.indexOf(activeTrack) + 1
    : recTracks.findIndex((t) => t.id === activeTrack?.id) + 1;

  const hasPrev = page > 1;
  const hasNext = totalPages != null ? page < totalPages : tracks.length === PAGE_SIZE;

  const statusText = error ? 'No connection' : loading && tracks.length === 0 ? 'Connecting' : 'Connected';

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleGenre = (value) => {
    setGenre(value);
    setPage(1);
  };

  return (
    <div className="mx-root" style={S.root}>
      <style>{GLOBAL_CSS}</style>

      {/* Top bar */}
      <div style={S.topBar}>
        <span>Track database</span>
        <span style={S.status}>
          <span style={dot(error ? C.red : C.card)} />
          {statusText}
        </span>
      </div>

      {/* Header + filters */}
      <header style={S.header}>
        <div style={S.headerRow}>
          <div>
            <h1 style={S.title}>
              Spotify Music
              <br />
              Intelligence
            </h1>
            <p style={S.subtitle}>
              {total != null
                ? `${total.toLocaleString()} tracks match your filters`
                : 'Search tracks by name, artist or genre'}
            </p>
          </div>

          <div style={S.controls}>
            <div style={S.field}>
              <label htmlFor="mx-search" style={label}>Search</label>
              <input
                id="mx-search"
                className="mx-focus"
                type="search"
                value={search}
                onChange={handleSearch}
                placeholder="Track or artist"
                autoComplete="off"
                style={S.input}
              />
            </div>

            <div style={S.field}>
              <label htmlFor="mx-genre" style={label}>Genre</label>
              <select
                id="mx-genre"
                className="mx-focus"
                value={genre}
                onChange={(e) => handleGenre(e.target.value)}
                style={S.select}
              >
                <option value="">All genres</option>
                {genres.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {genres.length > 0 && (
          <div style={S.chips} className="mx-hide-sm">
            <button
              type="button"
              className="mx-chip mx-focus"
              style={chipStyle(genre === '')}
              onClick={() => handleGenre('')}
            >
              All
            </button>
            {genres.slice(0, QUICK_GENRES).map((g) => (
              <button
                key={g}
                type="button"
                className="mx-chip mx-focus"
                style={chipStyle(genre === g)}
                onClick={() => handleGenre(genre === g ? '' : g)}
              >
                {truncate(g, 20)}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Main */}
      <main className="mx-main" style={S.main}>
        {/* Left: vinyl player deck */}
        <section className="mx-deck" style={S.deck} aria-live="polite" aria-label="Selected track">
          {activeTrack && <div style={S.bigIndex} aria-hidden="true">{pad2(activeNumber)}</div>}

          <div className="mx-vinyl-anchor" style={S.vinylAnchor} aria-hidden="true">
            <div className="mx-record" style={S.vinyl}>
              <div style={S.vinylRing} />
              <div style={S.vinylLabel} />
              <div style={S.vinylHole} />
            </div>
          </div>

          <div className="mx-deck-body" style={S.deckBody}>
            {activeTrack ? (
              <>
                <div style={S.badgeRow}>
                  <span style={S.badgeRed}>Now spinning</span>
                  <span style={S.badgeLine} title={activeTrack.genre}>
                    {truncate(activeTrack.genre, 30)}
                  </span>
                  <button
                    type="button"
                    className="mx-btn mx-focus"
                    style={{
                      ...S.button,
                      height: 30,
                      padding: '0 12px',
                      fontSize: 10,
                      background: C.ink,
                      color: C.card,
                    }}
                    onClick={() => handleExploreSimilar(activeTrack)}
                    title="Find tracks with matching audio features"
                  >
                    ⚡ Find Similar
                  </button>
                </div>

                <div>
                  <h2 style={S.artist} title={activeTrack.artist}>
                    {truncate(activeTrack.artist, 120)}
                  </h2>
                  <p style={S.songTitle} title={activeTrack.title}>
                    {truncate(activeTrack.title, 120)}
                  </p>
                </div>

                <div style={S.wave} aria-hidden="true">
                  {waveform(activeTrack.id).map((h, i) => (
                    <div
                      key={i}
                      style={{ flex: 1, height: `${h}%`, background: C.ink }}
                    />
                  ))}
                </div>

                <dl style={S.meta}>
                  <div style={S.metaCell}>
                    <dt style={S.metaTerm}>Genre</dt>
                    <dd style={S.metaGenre} title={activeTrack.genre}>
                      {truncate(activeTrack.genre, 40)}
                    </dd>
                  </div>
                  <div style={S.metaCell}>
                    <dt style={S.metaTerm}>Duration</dt>
                    <dd style={S.metaMono}>{formatDuration(activeTrack.durationMs)}</dd>
                  </div>
                  <div style={S.metaCell}>
                    <dt style={S.metaTerm}>Result</dt>
                    <dd style={{ ...S.metaMono, color: C.red }}>#{pad2(activeNumber)}</dd>
                  </div>
                </dl>

                {/* Audio features profile bar */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    paddingTop: 8,
                    borderTop: `1px solid ${C.ghost}`,
                    fontFamily: MONO,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <span style={{ padding: '3px 8px', background: C.ghost, border: `1px solid ${C.ink}` }}>
                    Dance: {activeTrack.danceability != null ? `${Math.round(activeTrack.danceability * 100)}%` : '--'}
                  </span>
                  <span style={{ padding: '3px 8px', background: C.ghost, border: `1px solid ${C.ink}` }}>
                    Energy: {activeTrack.energy != null ? `${Math.round(activeTrack.energy * 100)}%` : '--'}
                  </span>
                  <span style={{ padding: '3px 8px', background: C.ghost, border: `1px solid ${C.ink}` }}>
                    Valence: {activeTrack.valence != null ? `${Math.round(activeTrack.valence * 100)}%` : '--'}
                  </span>
                  <span style={{ padding: '3px 8px', background: C.ghost, border: `1px solid ${C.ink}` }}>
                    Acoustic: {activeTrack.acousticness != null ? `${Math.round(activeTrack.acousticness * 100)}%` : '--'}
                  </span>
                  <span style={{ padding: '3px 8px', background: C.ghost, border: `1px solid ${C.ink}` }}>
                    Tempo: {activeTrack.tempo != null ? `${Math.round(activeTrack.tempo)} BPM` : '--'}
                  </span>
                  {activeTrack.matchScore != null && (
                    <span style={{ padding: '3px 8px', background: C.red, color: C.card, border: `1px solid ${C.ink}` }}>
                      {activeTrack.matchScore}% Match
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ margin: 'auto 0', fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>
                {loading
                  ? 'Loading tracks'
                  : 'No track selected. Hover a result to see its details here.'}
              </div>
            )}
          </div>
        </section>

        {/* Right: result strips & recommendations */}
        <section style={S.right} aria-label="Track results and recommendations">
          {/* View mode switcher */}
          <div style={{ display: 'flex', gap: 8, borderBottom: `2px solid ${C.ink}`, paddingBottom: 10 }}>
            <button
              type="button"
              className="mx-btn mx-focus"
              style={chipStyle(activeTab === 'tracks')}
              onClick={() => setActiveTab('tracks')}
            >
              All Tracks ({total != null ? total.toLocaleString() : '...'})
            </button>
            <button
              type="button"
              className="mx-btn mx-focus"
              style={chipStyle(activeTab === 'recommendations')}
              onClick={() => {
                setActiveTab('recommendations');
                if (recTracks.length === 0) {
                  if (activeTrack) {
                    handleExploreSimilar(activeTrack);
                  } else {
                    fetchRecommendations();
                  }
                }
              }}
            >
              🎯 Recommendations {recSeedTrack ? `(Seeded)` : ''}
            </button>
          </div>

          {activeTab === 'tracks' ? (
            <>
              <div style={S.rightHead}>
                <h2 style={S.rightTitle}>Results</h2>
                <span style={S.rightCount}>
                  {tracks.length > 0 ? `${pad2(tracks.length)} on this page` : '00 on this page'}
                </span>
              </div>

              {error ? (
                <div style={S.statusBox} role="alert">
                  <p style={{ margin: 0, color: C.ink }}>
                    Couldn&apos;t load tracks ({truncate(error, 100)}). Check that the API is running, then retry.
                  </p>
                  <button
                    type="button"
                    className="mx-btn mx-focus"
                    style={S.button}
                    onClick={() => setReloadKey((k) => k + 1)}
                  >
                    Retry
                  </button>
                </div>
              ) : tracks.length === 0 ? (
                <div style={S.statusBox}>
                  <p style={{ margin: 0, color: C.ink }}>
                    {loading
                      ? 'Loading tracks'
                      : 'No tracks match. Clear the search or choose another genre.'}
                  </p>
                </div>
              ) : (
                <ol style={{ ...S.list, opacity: loading ? 0.55 : 1 }}>
                  {tracks.map((track, i) => {
                    const active = activeTrack?.id === track.id;
                    return (
                      <li key={track.id} style={{ display: 'flex', flex: 1 }}>
                        <div
                          className="mx-strip mx-focus"
                          tabIndex={0}
                          style={{ ...stripStyle(active, i === tracks.length - 1), width: '100%' }}
                          onMouseEnter={() => setActiveId(track.id)}
                          onFocus={() => setActiveId(track.id)}
                        >
                          <span
                            style={{
                              fontFamily: MONO,
                              fontWeight: 900,
                              fontSize: 30,
                              letterSpacing: '-0.04em',
                              color: active ? C.red : C.ink,
                            }}
                          >
                            {pad2((page - 1) * PAGE_SIZE + i + 1)}
                          </span>

                          <div style={{ minWidth: 0 }}>
                            <span
                              style={{
                                ...ellipsis,
                                color: 'inherit',
                                fontSize: 'clamp(17px, 1.6vw, 22px)',
                                fontWeight: 800,
                                letterSpacing: '-0.03em',
                              }}
                              title={track.title}
                            >
                              {truncate(track.title)}
                            </span>
                            <span
                              style={{
                                ...ellipsis,
                                marginTop: 4,
                                fontSize: 14,
                                color: active ? 'rgba(255,255,255,0.72)' : C.soft,
                              }}
                              title={track.artist}
                            >
                              {truncate(track.artist)}
                            </span>
                          </div>

                          <div style={{ textAlign: 'right', minWidth: 0 }}>
                            <span
                              style={{
                                display: 'block',
                                fontFamily: MONO,
                                fontWeight: 800,
                                fontSize: 18,
                                color: 'inherit',
                              }}
                            >
                              {formatDuration(track.durationMs)}
                            </span>
                            <span
                              className="mx-hide-sm"
                              style={{
                                ...ellipsis,
                                maxWidth: 130,
                                marginTop: 4,
                                marginLeft: 'auto',
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                color: active ? C.red : C.soft,
                              }}
                              title={track.genre}
                            >
                              {truncate(track.genre, 24)}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              <div style={S.pager}>
                <span style={S.pagerInfo}>
                  Page {pad2(page)}
                  {totalPages ? ` / ${pad2(totalPages)}` : ''}
                </span>
                <div style={S.pagerButtons}>
                  <button
                    type="button"
                    className="mx-btn mx-focus"
                    disabled={!hasPrev || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    style={{ ...S.button, ...(!hasPrev || loading ? S.buttonDisabled : null) }}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    className="mx-btn mx-focus"
                    disabled={!hasNext || loading}
                    onClick={() => setPage((p) => p + 1)}
                    style={{ ...S.button, ...(!hasNext || loading ? S.buttonDisabled : null) }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Recommendations view */}
              <div style={S.rightHead}>
                <div>
                  <h2 style={S.rightTitle}>Audio Recommendations</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: C.soft }}>
                    {recSeedTrack
                      ? `Tuned from: ${truncate(recSeedTrack.title, 32)} (${truncate(recSeedTrack.artist, 24)})`
                      : 'Finding nearest tracks matching target audio features'}
                  </p>
                </div>
                <span style={S.rightCount}>
                  {recTracks.length > 0 ? `${pad2(recTracks.length)} matches` : '00 matches'}
                </span>
              </div>

              {/* Controls card */}
              <div
                style={{
                  padding: 16,
                  background: C.card,
                  border: `2px solid ${C.ink}`,
                  boxShadow: `4px 4px 0 ${C.ink}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {recSeedTrack && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: C.ghost,
                      padding: '6px 12px',
                      border: `1px solid ${C.ink}`,
                      fontSize: 12,
                    }}
                  >
                    <span>
                      <strong>Seed:</strong> {recSeedTrack.title} — {recSeedTrack.artist}
                    </span>
                    <button
                      type="button"
                      className="mx-focus"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: C.red,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                      onClick={handleClearSeed}
                    >
                      ✕ Clear Seed
                    </button>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 12,
                    fontSize: 11,
                    fontFamily: MONO,
                    fontWeight: 700,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Dance</span>
                      <span>{Math.round(recFeatures.danceability * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={recFeatures.danceability}
                      onChange={(e) =>
                        setRecFeatures((prev) => ({ ...prev, danceability: parseFloat(e.target.value) }))
                      }
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Energy</span>
                      <span>{Math.round(recFeatures.energy * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={recFeatures.energy}
                      onChange={(e) =>
                        setRecFeatures((prev) => ({ ...prev, energy: parseFloat(e.target.value) }))
                      }
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Valence</span>
                      <span>{Math.round(recFeatures.valence * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={recFeatures.valence}
                      onChange={(e) =>
                        setRecFeatures((prev) => ({ ...prev, valence: parseFloat(e.target.value) }))
                      }
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Acoustic</span>
                      <span>{Math.round(recFeatures.acousticness * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={recFeatures.acousticness}
                      onChange={(e) =>
                        setRecFeatures((prev) => ({ ...prev, acousticness: parseFloat(e.target.value) }))
                      }
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Tempo</span>
                      <span>{Math.round(recFeatures.tempo)} BPM</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      step="1"
                      value={recFeatures.tempo}
                      onChange={(e) =>
                        setRecFeatures((prev) => ({ ...prev, tempo: parseInt(e.target.value, 10) }))
                      }
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label htmlFor="mx-rec-genre" style={{ ...label, fontSize: 10 }}>
                      Filter Genre:
                    </label>
                    <select
                      id="mx-rec-genre"
                      value={recGenre}
                      onChange={(e) => setRecGenre(e.target.value)}
                      style={{ ...S.select, height: 36, width: 160, fontSize: 13 }}
                    >
                      <option value="">Any genre</option>
                      {genres.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {activeTrack && (
                      <button
                        type="button"
                        className="mx-btn mx-focus"
                        style={{ ...S.button, height: 36, padding: '0 12px', fontSize: 10 }}
                        onClick={() => handleExploreSimilar(activeTrack)}
                      >
                        Reset to Spinning
                      </button>
                    )}
                    <button
                      type="button"
                      className="mx-btn mx-focus"
                      style={{
                        ...S.button,
                        height: 36,
                        padding: '0 16px',
                        fontSize: 10,
                        background: C.red,
                        color: C.card,
                      }}
                      onClick={handleApplySliders}
                    >
                      Update Matches
                    </button>
                  </div>
                </div>
              </div>

              {recError ? (
                <div style={S.statusBox} role="alert">
                  <p style={{ margin: 0, color: C.ink }}>
                    Failed to load recommendations ({truncate(recError, 100)}).
                  </p>
                  <button
                    type="button"
                    className="mx-btn mx-focus"
                    style={S.button}
                    onClick={() => handleApplySliders()}
                  >
                    Retry
                  </button>
                </div>
              ) : recTracks.length === 0 ? (
                <div style={S.statusBox}>
                  <p style={{ margin: 0, color: C.ink }}>
                    {recLoading
                      ? 'Analyzing audio features and finding nearest neighbors in vector space...'
                      : 'No recommendations found. Adjust feature sliders or clear the genre filter.'}
                  </p>
                </div>
              ) : (
                <ol style={{ ...S.list, opacity: recLoading ? 0.55 : 1 }}>
                  {recTracks.map((track, i) => {
                    const active = activeTrack?.id === track.id;
                    return (
                      <li key={track.id} style={{ display: 'flex', flex: 1 }}>
                        <div
                          className="mx-strip mx-focus"
                          tabIndex={0}
                          style={{ ...stripStyle(active, i === recTracks.length - 1), width: '100%' }}
                          onMouseEnter={() => setActiveId(track.id)}
                          onFocus={() => setActiveId(track.id)}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              minWidth: 60,
                            }}
                          >
                            <span
                              style={{
                                fontFamily: MONO,
                                fontWeight: 900,
                                fontSize: 20,
                                color: active ? C.red : C.ink,
                                lineHeight: 1,
                              }}
                            >
                              {track.matchScore != null ? `${track.matchScore}%` : `#${i + 1}`}
                            </span>
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                marginTop: 2,
                              }}
                            >
                              MATCH
                            </span>
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <span
                              style={{
                                ...ellipsis,
                                color: 'inherit',
                                fontSize: 'clamp(16px, 1.5vw, 20px)',
                                fontWeight: 800,
                                letterSpacing: '-0.03em',
                              }}
                              title={track.title}
                            >
                              {truncate(track.title)}
                            </span>
                            <span
                              style={{
                                ...ellipsis,
                                marginTop: 2,
                                fontSize: 13,
                                color: active ? 'rgba(255,255,255,0.72)' : C.soft,
                              }}
                              title={track.artist}
                            >
                              {truncate(track.artist)}
                            </span>
                            <div
                              className="mx-hide-sm"
                              style={{
                                display: 'flex',
                                gap: 8,
                                marginTop: 4,
                                fontSize: 10,
                                fontFamily: MONO,
                                color: active ? 'rgba(255,255,255,0.6)' : C.soft,
                              }}
                            >
                              <span>D: {track.danceability != null ? Math.round(track.danceability * 100) : '--'}%</span>
                              <span>E: {track.energy != null ? Math.round(track.energy * 100) : '--'}%</span>
                              <span>V: {track.valence != null ? Math.round(track.valence * 100) : '--'}%</span>
                              <span>{track.tempo != null ? `${Math.round(track.tempo)} BPM` : ''}</span>
                            </div>
                          </div>

                          <div
                            style={{
                              textAlign: 'right',
                              minWidth: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: 6,
                            }}
                          >
                            <span
                              style={{
                                display: 'block',
                                fontFamily: MONO,
                                fontWeight: 800,
                                fontSize: 16,
                                color: 'inherit',
                              }}
                            >
                              {formatDuration(track.durationMs)}
                            </span>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button
                                type="button"
                                className="mx-focus"
                                style={{
                                  padding: '2px 8px',
                                  background: active ? C.card : C.ink,
                                  color: active ? C.ink : C.card,
                                  border: `1px solid ${C.ink}`,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  textTransform: 'uppercase',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveId(track.id);
                                }}
                                title="Play track in player deck"
                              >
                                Spin
                              </button>
                              <button
                                type="button"
                                className="mx-focus"
                                style={{
                                  padding: '2px 8px',
                                  background: C.red,
                                  color: C.card,
                                  border: `1px solid ${C.ink}`,
                                  fontSize: 10,
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  textTransform: 'uppercase',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExploreSimilar(track);
                                }}
                                title="Seed recommendations from this track"
                              >
                                Seed
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer style={S.footer}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={dot(C.red)} />
          {PAGE_SIZE} per page
        </span>
        <span>{genres.length > 0 ? `${genres.length} genres indexed` : 'Genres unavailable'}</span>
      </footer>
    </div>
  );
}