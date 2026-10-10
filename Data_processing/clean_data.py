import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
from pathlib import Path
from urllib.parse import quote_plus

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=REPO_ROOT / "backend" / ".env")


# 1. Database Connection Configuration
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Keep compatibility with the individual DB_* settings used locally.
    DB_USER = quote_plus(os.getenv("DB_USER", "postgres"))
    DB_PASSWORD = quote_plus(os.getenv("DB_PASSWORD", ""))
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = quote_plus(os.getenv("DB_NAME", "spotify_intelligence"))
    credentials = f"{DB_USER}:{DB_PASSWORD}" if DB_PASSWORD else DB_USER
    DATABASE_URL = f"postgresql://{credentials}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL)

def run_pipeline():
    csv_path = REPO_ROOT / "Data" / "raw" / "spotify_tracks.csv"

    if not csv_path.exists():
        print(f"Error:Raw dataset not found at {csv_path}.")
        return

    print("stage 1: Ingesting raw track data records..")
    df=pd.read_csv(csv_path)

    print("stage 2: Initiating data deduplication processing..")
    df=df.dropna(subset=['track_id','track_name','artists'])

    #sort by popularity descending to retain the most relevant duplication entry instance
    df=df.sort_values(by='popularity',ascending=False)
    df=df.drop_duplicates(subset=['track_id'],keep='first')


    #select target analytics column dimensions
    target_columns=[
        'track_id', 'track_name', 'artists', 'album_name', 'track_genre', 
        'popularity', 'duration_ms', 'explicit', 'danceability', 'energy', 
        'loudness', 'speechiness', 'acousticness', 'instrumentalness', 
        'liveness', 'valence', 'tempo'
    ]

    df=df[target_columns]

    #Map raw explicit booleans into database integer falgs 0 or 1
    df['explicit']=df['explicit'].astype(int)
    print(f"Deduplication absolute metrics: verified {len(df)} unique records" )

    print("stage 3:Directing clean streams to relational 'tracks' entity..")
    #append structures rows directly to postgreSQL
    df.to_sql('tracks',engine, if_exists='replace',index=False)
    print("Relational tracks records loaded successfully")
    print("Relational 'tracks' records loaded successfully")

    print(" Stage 4: Executing pre-computed dimensional calculations for Genre DNA...")
    genre_metrics = df.groupby('track_genre').agg(
        avg_popularity=('popularity', 'mean'),
        avg_danceability=('danceability', 'mean'),
        avg_energy=('energy', 'mean'),
        avg_valence=('valence', 'mean'),
        avg_acousticness=('acousticness', 'mean'),
        avg_instrumentalness=('instrumentalness', 'mean'),
        avg_speechiness=('speechiness', 'mean'),
        avg_tempo=('tempo', 'mean'),
        track_count=('track_id', 'count')
    ).reset_index()

    print(" Stage 5: Ingesting pre-computed aggregation arrays into 'genre_analytics'...")
    genre_metrics.to_sql('genre_analytics', engine, if_exists='replace', index=False)
    print(" Data processing pipelines completed successfully!")

if __name__ == "__main__":
    run_pipeline()


    
