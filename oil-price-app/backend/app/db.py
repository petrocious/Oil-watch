import os
from sqlalchemy import create_engine, text

DB_URL = os.getenv("DATABASE_URL", "postgresql://oiluser:StrongPassword123!@postgres:5432/oilprice")
engine = create_engine(DB_URL, pool_pre_ping=True)

def init_db():
    with engine.begin() as c:
        c.execute(text("""
            CREATE TABLE IF NOT EXISTS prices (
              id SERIAL PRIMARY KEY,
              symbol TEXT NOT NULL,
              ts TIMESTAMPTZ NOT NULL,
              value NUMERIC(10,4) NOT NULL,
              UNIQUE(symbol, ts)
            );
            CREATE INDEX IF NOT EXISTS idx_prices_symbol_ts ON prices(symbol, ts DESC);
        """))

def get_series(days: int = 30):
    out = {}
    with engine.connect() as c:
        for sym in ("ho", "ulsd", "rbob", "wti"):
            rows = c.execute(text("""
                SELECT EXTRACT(EPOCH FROM ts)*1000 AS t, value
                FROM prices WHERE symbol = :s
                  AND ts > NOW() - (:d || ' days')::interval
                ORDER BY ts
            """), {"s": sym, "d": days}).fetchall()
            out[sym] = [{"t": int(r[0]), "v": float(r[1])} for r in rows]
    return out