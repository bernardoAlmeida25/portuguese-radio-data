"""Scraper for Portuguese radio "now playing" widgets (ASP.NET AJAX + JSON log endpoints)."""

import random
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable

import requests
from bs4 import BeautifulSoup
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font

OUTPUT_FILE = Path("radio_tracks.xlsx")
SHEET_NAME = "Tracks"
COLUMNS = ["Station", "Date", "Hour", "Track", "Artist"]

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
        return [self.station, self.day, self.hour, self.title, self.artist]

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


# --- Excel output -----------------------------------------------------------

def load_or_create_workbook():
    if OUTPUT_FILE.exists():
        wb = load_workbook(OUTPUT_FILE)
        ws = wb[SHEET_NAME]
        existing = {
            (row[0], row[1].strftime("%Y-%m-%d") if hasattr(row[1], "strftime") else str(row[1]), *row[2:])
            for row in ws.iter_rows(min_row=2, values_only=True)
        }
        return wb, ws, existing

    wb = Workbook()
    ws = wb.active
    ws.title = SHEET_NAME
    ws.append(COLUMNS)
    for cell in ws[1]:
        cell.font = Font(name="Arial", bold=True)
        cell.alignment = Alignment(horizontal="center")
    return wb, ws, set()


def append_tracks(tracks: list[Track]) -> int:
    wb, ws, existing = load_or_create_workbook()

    added = 0
    for track in tracks:
        if track.dedup_key() in existing:
            continue
        ws.append(track.as_row())
        ws.cell(row=ws.max_row, column=2).number_format = "DD/MM/YYYY"
        for col in range(1, len(COLUMNS) + 1):
            ws.cell(row=ws.max_row, column=col).font = Font(name="Arial")
        existing.add(track.dedup_key())
        added += 1

    for col, width in zip("ABCDE", [12, 12, 8, 35, 30]):
        ws.column_dimensions[col].width = width

    wb.save(OUTPUT_FILE)
    return added


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
    total_added = 0
    for station in STATIONS:
        tracks = station.fetch_full_day(day_keyword="yesterday")
        added = append_tracks(tracks)
        print(f"{station.name}: {len(tracks)} tracks fetched, {added} new rows added")
        total_added += added

    print(f"Done. {total_added} new rows in total.")