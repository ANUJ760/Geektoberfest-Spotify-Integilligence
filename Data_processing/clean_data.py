"""Load the Spotify CSV into the PostgreSQL tracks and genre_analytics tables."""

import os
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_ROOT / "Data" / "raw" / "spotify_tracks.csv"
# Deployment platforms inject DATABASE_URL directly. For local runs, allow a
# repo-root .env and the backend's existing .env file (without overriding an
# already-exported environment variable).
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "backend" / ".env")


def get_database_url():
    """Read the deployment URL or assemble a local URL from DB_* settings."""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        # Normalize Render's legacy scheme and require TLS for external Render
        # database URLs. Internal Render URLs and user-specified sslmode are kept.
        if database_url.startswith("postgres://"):
            database_url = "postgresql://" + database_url[len("postgres://"):]
        try:
            url = make_url(database_url)
        except Exception as error:
            raise ValueError("DATABASE_URL is not a valid PostgreSQL URL") from error
        if url.get_backend_name() != "postgresql":
            raise ValueError("DATABASE_URL must use the postgresql:// scheme")
        if (
            url.host
            and "render.com" in url.host
            and ".internal" not in url.host
            and "sslmode" not in url.query
        ):
            url = url.update_query_dict({"sslmode": "require"})
        return url.render_as_string(hide_password=False)

    # Don't silently connect to localhost on a deployed job when its database
    # configuration was omitted.
    if not os.getenv("DB_HOST"):
        raise RuntimeError(
            "Database is not configured. Set DATABASE_URL, or set DB_HOST and "
            "the related DB_* variables for a local PostgreSQL database."
        )

    user = quote_plus(os.getenv("DB_USER", "postgres"))
    password = quote_plus(os.getenv("DB_PASSWORD", ""))
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    database = quote_plus(os.getenv("DB_NAME", "spotify_intelligence"))
    credentials = f"{user}:{password}" if password else user
    return f"postgresql://{credentials}@{host}:{port}/{database}"


# Render should provide DATABASE_URL in the service environment. Locally, this
# resolves from DATABASE_URL in .env or falls back to the DB_* settings above.
DATABASE_URL = get_database_url()


CREATE_TABLES = (
    """CREATE TABLE IF NOT EXISTS tracks (
        track_id TEXT PRIMARY KEY,
        track_name TEXT NOT NULL,
        artists TEXT NOT NULL,
        album_name TEXT,
        track_genre TEXT,
        popularity INTEGER,
        duration_ms INTEGER,
        explicit SMALLINT NOT NULL DEFAULT 0 CHECK (explicit IN (0, 1)),
        danceability DOUBLE PRECISION,
        energy DOUBLE PRECISION,
        loudness DOUBLE PRECISION,
        speechiness DOUBLE PRECISION,
        acousticness DOUBLE PRECISION,
        instrumentalness DOUBLE PRECISION,
        liveness DOUBLE PRECISION,
        valence DOUBLE PRECISION,
        tempo DOUBLE PRECISION
    )""",
    """CREATE TABLE IF NOT EXISTS genre_analytics (
        track_genre TEXT PRIMARY KEY,
        avg_popularity DOUBLE PRECISION,
        avg_danceability DOUBLE PRECISION,
        avg_energy DOUBLE PRECISION,
        avg_valence DOUBLE PRECISION,
        avg_acousticness DOUBLE PRECISION,
        avg_instrumentalness DOUBLE PRECISION,
        avg_speechiness DOUBLE PRECISION,
        avg_tempo DOUBLE PRECISION,
        track_count BIGINT NOT NULL DEFAULT 0
    )""",
)

TRACK_COLUMNS = [
    "track_id", "track_name", "artists", "album_name", "track_genre",
    "popularity", "duration_ms", "explicit", "danceability", "energy",
    "loudness", "speechiness", "acousticness", "instrumentalness",
    "liveness", "valence", "tempo",
]


def prepare_tracks():
    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Spotify CSV not found: {CSV_PATH}")

    tracks = pd.read_csv(CSV_PATH)
    missing_columns = sorted(set(TRACK_COLUMNS) - set(tracks.columns))
    if missing_columns:
        raise ValueError(f"CSV is missing required columns: {', '.join(missing_columns)}")

    tracks = tracks.dropna(subset=["track_id", "track_name", "artists"]).copy()
    tracks["popularity"] = pd.to_numeric(tracks["popularity"], errors="coerce")
    tracks = tracks.sort_values("popularity", ascending=False, na_position="last")
    tracks = tracks.drop_duplicates(subset=["track_id"], keep="first")
    tracks = tracks[TRACK_COLUMNS].copy()

    # Accept CSV boolean values as well as 0/1 and common textual equivalents.
    explicit_values = tracks["explicit"].astype("string").str.strip().str.lower()
    tracks["explicit"] = explicit_values.isin({"true", "1", "yes", "y"}).astype("int16")

    return tracks


def build_genre_analytics(tracks):
    return (
        tracks.dropna(subset=["track_genre"])
        .groupby("track_genre", as_index=False)
        .agg(
            avg_popularity=("popularity", "mean"),
            avg_danceability=("danceability", "mean"),
            avg_energy=("energy", "mean"),
            avg_valence=("valence", "mean"),
            avg_acousticness=("acousticness", "mean"),
            avg_instrumentalness=("instrumentalness", "mean"),
            avg_speechiness=("speechiness", "mean"),
            avg_tempo=("tempo", "mean"),
            track_count=("track_id", "count"),
        )
    )


def run_pipeline():
    tracks = prepare_tracks()
    genre_metrics = build_genre_analytics(tracks)
    target = make_url(DATABASE_URL)
    print(
        f"Prepared {len(tracks):,} unique tracks and {len(genre_metrics):,} "
        f"genres from {CSV_PATH.name}."
    )
    print(
        "Connecting to PostgreSQL database "
        f"'{target.database}' on '{target.host}:{target.port or 5432}'."
    )
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"connect_timeout": 15})

    try:
        # Keep both tables in sync: a failed import rolls the whole transaction
        # back, and repeat imports replace rows without dropping table schema.
        with engine.begin() as connection:
            for statement in CREATE_TABLES:
                connection.execute(text(statement))

            connection.execute(text("TRUNCATE TABLE tracks, genre_analytics"))

            tracks.to_sql(
                "tracks", connection, if_exists="append", index=False,
                chunksize=1000, method="multi",
            )
            genre_metrics.to_sql(
                "genre_analytics", connection, if_exists="append", index=False,
                chunksize=1000, method="multi",
            )

        print(f"Loaded {len(tracks):,} tracks and {len(genre_metrics):,} genres.")
        print("CSV import completed successfully.")
    except Exception as error:
        # The DBAPI error provides actionable details without printing the URL.
        details = str(getattr(error, "orig", error))
        raise RuntimeError(
            f"Database import failed ({type(error).__name__}): {details}. "
            "Check that the database target above is the one used by the backend."
        ) from None
    finally:
        engine.dispose()


if __name__ == "__main__":
    run_pipeline()
