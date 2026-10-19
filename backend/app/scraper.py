import os, random
from datetime import datetime, timedelta
from sqlalchemy import text
from .db import engine

# Demo generator — swap for real EIA API later
BASE = {"ho": 2.85, "ulsd": 3.45, "rbob": 3.05, "wti": 78.5}

def fetch_and_store():
    now = datetime.utcnow()
    with engine.begin() as c:
        for sym, base in BASE.items():
            for h in range(0, 24, 6):
                ts = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=h)
                val = base + random.uniform(-0.15, 0.15)
                c.execute(text("""
                    INSERT INTO prices (symbol, ts, value)
                    VALUES (:s, :t, :v)
                    ON CONFLICT (symbol, ts) DO UPDATE SET value = EXCLUDED.value
                """), {"s": sym, "t": ts, "v": round(val, 3)})
    print(f"[scraper] stored {len(BASE)*4} rows at {now.isoformat()}")