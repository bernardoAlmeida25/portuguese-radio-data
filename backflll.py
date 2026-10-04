"""One-off backfill for Rádio Comercial's missing days (JSON archive available from Sept 3rd)."""

from datetime import date, timedelta
from radios import RADIO_COMERCIAL, append_tracks

MISSING_DAYS = [
    date(2026, 9, 10),
    date(2026, 9, 18),
    date(2026, 9, 19),
    date(2026, 9, 21),
    date(2026, 9, 23),
    date(2026, 9, 24),
    date(2026, 9, 25),
    date(2026, 9, 26),
]

for day in MISSING_DAYS:
    tracks = RADIO_COMERCIAL.fetch_day(day)
    added = append_tracks(tracks)
    print(f"{day}: {len(tracks)} tracks fetched, {added} new rows added")