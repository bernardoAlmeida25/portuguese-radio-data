"""Scraper for Portuguese radio "now playing" widgets (ASP.NET AJAX + JSON log endpoints)."""

import atexit
import csv
import random
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable

import requests
from bs4 import BeautifulSoup

OUTPUT_FILE = Path("radio_tracks.csv")
COLUMNS = ["Station", "Date", "Hour", "Track", "Artist"]
LOCK_FILE = Path("radios.lock")

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
)


@dataclass
class Track:
    station: str
    day: date
    hour: str
    title: str
    artist: str

    def as_row(self) -> list:
        return [self.station, str(self.day), self.hour, self.title, self.artist]

    def dedup_key(self) -> tuple:
        return (self.station, str(self.day), self.hour, self.title, self.artist)


def resolve_date(day_keyword: str) -> date:
    today = datetime.now().date()
    if day_keyword == "today":
        return today
    if day_keyword == "yesterday":
        return today - timedelta(days=1)
    raise ValueError(f"Unknown day keyword: {day_keyword!r}")


# --- AJAX-based stations (RFM, Mega Hits, ...) --------------------------

@dataclass
class AjaxStationConfig:
    name: str
    endpoint: str
    referer: str
    build_payload: Callable[[int], dict]
    parse_response: Callable[[str], list[tuple[str, str, str]]]
    """parse_response returns a list of (hour, title, artist) tuples."""

    @property
    def origin(self) -> str:
        return "/".join(self.endpoint.split("/")[:3])

    def headers(self) -> dict:
        return {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": self.origin,
            "Referer": self.referer,
            "User-Agent": USER_AGENT,
            "Accept": "*/*",
        }

    def fetch_full_day(self, day_keyword: str = "yesterday") -> list[Track]:
        """Fetch every hour of a given day. Use 'yesterday' to guarantee a complete day."""
        day = resolve_date(day_keyword)
        all_tracks = []
        for hour in range(24):
            payload = self.build_payload(hour)
            response = requests.post(self.endpoint, data=payload, headers=self.headers())
            response.raise_for_status()
            for h, title, artist in self.parse_response(response.text):
                all_tracks.append(Track(station=self.name, day=day, hour=h, title=title, artist=artist))
            time.sleep(0.5)  # be polite to the server
        return all_tracks


# --- JSON log-based stations (Rádio Comercial, ...) ----------------------

@dataclass
class JsonLogStationConfig:
    name: str
    url_template: str  # must contain "{date}", e.g. "https://.../radio-comercial_{date}.json"

    def fetch_day(self, day: date) -> list[Track]:
        url = self.url_template.format(date=day.strftime("%Y-%m-%d"))
        response = requests.get(url, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        data = response.json()

        records = data.get("NOW_PLAYING_LOG", {}).get("NOW_PLAYING_RECORD", [])
        tracks = []
        for record in records:
            zenon = record.get("ZENON")
            date_str = record.get("DATE")
            if not (zenon and date_str):
                continue

            title = zenon.get("SONG_NAME")
            artist = zenon.get("ARTIST_NAME")
            if not (title and artist):
                continue

            dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            tracks.append(Track(station=self.name, day=dt.date(), hour=dt.strftime("%H:%M"), title=title, artist=artist))
        return tracks

    def fetch_full_day(self, day_keyword: str = "yesterday") -> list[Track]:
        return self.fetch_day(resolve_date(day_keyword))


# --- Response parsers (for AJAX stations) --------------------------------

def parse_rfm(html: str) -> list[tuple[str, str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    results = []
    for block in soup.select("ul.g-mx.g-mt"):
        hour_tag = block.select_one(".t-hor")
        title_tag = block.select_one(".t-desc .medium")
        artist_tag = block.select_one(".t-desc .large")
        if not (hour_tag and title_tag and artist_tag):
            continue
        results.append((
            hour_tag.get_text(strip=True),
            title_tag.get_text(strip=True),
            artist_tag.get_text(strip=True),
        ))
    return results


def parse_megahits(html: str) -> list[tuple[str, str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    results = []
    for card in soup.select("div.ac-card1"):
        hour_tag = card.select_one(".ac-horas1")
        title_tag = card.select_one(".ac-nomem1")
        artist_tag = card.select_one(".ac-autor1")
        if not (hour_tag and title_tag and artist_tag):
            continue
        results.append((
            hour_tag.get_text(strip=True),
            title_tag.get_text(strip=True),
            artist_tag.get_text(strip=True),
        ))
    return results


# --- CSV output -----------------------------------------------------------

def load_existing_keys() -> set:
    """Read existing rows to avoid duplicates. Returns an empty set if the file doesn't exist yet."""
    if not OUTPUT_FILE.exists():
        return set()

    with open(OUTPUT_FILE, "r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        return {tuple(row) for row in reader}


def append_tracks(tracks: list[Track]) -> int:
    existing = load_existing_keys()
    file_exists = OUTPUT_FILE.exists()

    new_rows = [t.as_row() for t in tracks if t.dedup_key() not in existing]

    with open(OUTPUT_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(COLUMNS)
        writer.writerows(new_rows)

    return len(new_rows)


# --- Concurrency guard ---------------------------------------------------

def acquire_lock():
    """Prevent two instances from running at once and racing on the CSV file.

    If the lock file already exists, another run is assumed to be in
    progress and this process exits. The lock is released automatically
    on normal exit via atexit, but can be left behind if the process is
    killed forcefully (SIGKILL) — delete radios.lock by hand if that
    ever happens and you're sure no instance is actually running.
    """
    if LOCK_FILE.exists():
        print(f"Lock file {LOCK_FILE} already exists — another run seems to be in progress. Exiting.")
        sys.exit(1)
    LOCK_FILE.touch()
    atexit.register(release_lock)


def release_lock():
    LOCK_FILE.unlink(missing_ok=True)


# --- Station configs --------------------------------------------------

RFM = AjaxStationConfig(
    name="RFM",
    endpoint="https://rfm.pt/ajax/quemusicaera/getquemusicaera_rfm.aspx",
    referer="https://rfm.pt/que-musica-era",
    build_payload=lambda hour: {
        "hora": str(hour),
        "dia": "yesterday",
        "randval": str(random.random()),
    },
    parse_response=parse_rfm,
)

MEGA_HITS = AjaxStationConfig(
    name="Mega Hits",
    endpoint="https://megahits.fm/ajax/pesquisa/acaboudetocar.aspx",
    referer="https://megahits.fm/acabou-de-tocar",
    build_payload=lambda hour: {
        "hora": str(hour),
        "min": "0",
        "dia": "yesterday",
        "canal": "1",
        "randval": str(random.random()),
    },
    parse_response=parse_megahits,
)

RADIO_COMERCIAL = JsonLogStationConfig(
    name="Rádio Comercial",
    url_template="https://radiocomercial.pt/now_playing_logs/json/radio-comercial_{date}.json",
)

STATIONS = [RFM, MEGA_HITS, RADIO_COMERCIAL]


if __name__ == "__main__":
    acquire_lock()

    total_added = 0
    for station in STATIONS:
        tracks = station.fetch_full_day(day_keyword="yesterday")
        added = append_tracks(tracks)
        print(f"{station.name}: {len(tracks)} tracks fetched, {added} new rows added")
        total_added += added

    print(f"Done. {total_added} new rows in total.")