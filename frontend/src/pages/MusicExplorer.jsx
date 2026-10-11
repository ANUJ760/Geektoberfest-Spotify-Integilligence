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
  const [genresLoading, setGenresLoading] = useState(true);
  const [genresError, setGenresError] = useState(null);
  const [genresReloadKey, setGenresReloadKey] = useState(0);

  const [tracks, setTracks] = useState([]);
  const [total, setTotal] = useState(null);
  const [totalPages, setTotalPages] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [sortBy, setSortBy] = useState('popularity');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeId, setActiveId] = useState(null);

  /* Genres: load on mount and upon retry */
  useEffect(() => {
    let cancelled = false;
    setGenresLoading(true);
    setGenresError(null);

    (async () => {
      try {
        const res = await trackService.getGenres();
        if (!cancelled) {
          setGenres(parseGenresResponse(res));
          setGenresLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setGenres([]);
          setGenresError(err?.message || 'Failed to load genres');
          setGenresLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [genresReloadKey]);

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
          sortBy,
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
  }, [page, search, genre, sortBy, reloadKey]);

  const activeTrack = tracks.find((t) => t.id === activeId) ?? tracks[0] ?? null;
  const activeIndex = activeTrack ? tracks.indexOf(activeTrack) : -1;
  const activeNumber = (page - 1) * PAGE_SIZE + activeIndex + 1;

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

  const handleSort = (value) => {
    setSortBy(value);
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
                disabled={genresLoading}
              >
                {genresLoading ? (
                  <option value="">Loading genres...</option>
                ) : genresError ? (
                  <option value="">Genres unavailable</option>
                ) : genres.length === 0 ? (
                  <option value="">No genres available</option>
                ) : (
                  <>
                    <option value="">All genres</option>
                    {genres.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div style={S.field}>
              <label htmlFor="mx-sort" style={label}>Sort by</label>
              <select
                id="mx-sort"
                className="mx-focus"
                value={sortBy}
                onChange={(e) => handleSort(e.target.value)}
                style={S.select}
              >
                <option value="popularity">Popularity</option>
                <option value="name">Name (A–Z)</option>
                <option value="duration">Duration</option>
              </select>
            </div>
          </div>
          {genresError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: C.red }}>
              <span>Could not load genres ({truncate(genresError, 40)})</span>
              <button
                type="button"
                className="mx-btn mx-focus"
                style={{
                  padding: '2px 8px',
                  fontSize: 12,
                  background: 'none',
                  border: `1px solid ${C.red}`,
                  color: C.red,
                  cursor: 'pointer',
                  borderRadius: 2,
                }}
                onClick={() => setGenresReloadKey((k) => k + 1)}
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {genresLoading ? (
          <div style={S.chips} className="mx-hide-sm">
            <span style={{ fontSize: 13, color: C.soft }}>Loading genres...</span>
          </div>
        ) : genresError ? (
          <div style={S.chips} className="mx-hide-sm">
            <span style={{ fontSize: 13, color: C.red }}>Failed to load genres</span>
            <button
              type="button"
              className="mx-chip mx-focus"
              style={{ ...chipStyle(false), borderColor: C.red, color: C.red }}
              onClick={() => setGenresReloadKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        ) : genres.length === 0 ? (
          <div style={S.chips} className="mx-hide-sm">
            <span style={{ fontSize: 13, color: C.soft }}>No genres available in database</span>
          </div>
        ) : (
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

        {/* Right: result strips */}
        <section style={S.right} aria-label="Track results">
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
                {loading ? (
                  'Loading tracks...'
                ) : search || genre ? (
                  'No tracks match your current filter.'
                ) : (
                  'No tracks found in the database. Run the CSV importer to populate data.'
                )}
              </p>
              {!loading && (search || genre) && (
                <button
                  type="button"
                  className="mx-btn mx-focus"
                  style={S.button}
                  onClick={() => {
                    setSearch('');
                    setGenre('');
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              )}
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
        </section>
      </main>

      {/* Footer */}
      <footer style={S.footer}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={dot(C.red)} />
          {PAGE_SIZE} per page
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {genresLoading ? (
            <span>Loading genres...</span>
          ) : genresError ? (
            <>
              <span style={{ color: C.red }}>Failed to load genres ({truncate(genresError, 40)})</span>
              <button
                type="button"
                className="mx-btn mx-focus"
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  background: 'none',
                  border: `1px solid ${C.red}`,
                  color: C.red,
                  cursor: 'pointer',
                  borderRadius: 2,
                }}
                onClick={() => setGenresReloadKey((k) => k + 1)}
              >
                Retry
              </button>
            </>
          ) : genres.length === 0 ? (
            <span>0 genres indexed (empty database)</span>
          ) : (
            <span>{genres.length} genres indexed</span>
          )}
        </span>
      </footer>
    </div>
  );
}