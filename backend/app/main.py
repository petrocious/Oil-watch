from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from .db import init_db, get_series
from .scraper import fetch_and_store

app = FastAPI(title="OILWATCH API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    sched = BackgroundScheduler()
    sched.add_job(fetch_and_store, "interval", minutes=30, id="scrape")
    sched.start()
    fetch_and_store()  # seed immediately

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/prices")
def prices(days: int = 30):
    return {"series": get_series(days)}