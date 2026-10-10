"""Load the Spotify CSV into the PostgreSQL tracks and genre_analytics tables."""

import os
from pathlib import Path
from urllib.parse import quote_plus

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text


REPO_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = REPO_ROOT / "Data" / "raw" / "spotify_tracks.csv"
load_dotenv(REPO_ROOT / "backend" / ".env")


def get_database_url():
    """Read DATABASE_URL or assemble one from the legacy DB_* settings."""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    user = quote_plus(os.getenv("DB_USER", "postgres"))
    password = quote_plus(os.getenv("DB_PASSWORD", ""))
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    database = quote_plus(os.getenv("DB_NAME", "spotify_intelligence"))
    credentials = f"{user}:{password}" if password else user
    return f"postgresql://{credentials}@{host}:{port}/{database}"


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
    engine = create_engine(get_database_url(), pool_pre_ping=True)

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
    finally:
        engine.dispose()


if __name__ == "__main__":
    run_pipeline()
