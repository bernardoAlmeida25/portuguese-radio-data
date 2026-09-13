# Portuguese Radio Airplay Data

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Python](https://img.shields.io/badge/python-3.9%2B-blue)
![Data](https://img.shields.io/badge/data-daily%20updates-brightgreen)

An open dataset and scraper tracking which songs are played, and when, on major Portuguese radio stations (RFM, Mega Hits, Rádio Comercial). Updated daily. Part of a broader effort to build open datasets about Portugal, inspired by [Central de Dados](https://github.com/centraldedados).

## What it does

Each station publishes its recently-played tracks through a different mechanism:

| Station | Method | Notes |
|---|---|---|
| RFM | ASP.NET AJAX endpoint (`.aspx`), one request per hour | Requires `hora`/`dia`/`randval` payload |
| Mega Hits | ASP.NET AJAX endpoint (`.aspx`), one request per hour | Requires `hora`/`min`/`dia`/`canal`/`randval` payload |
| Rádio Comercial | Static JSON log, one file per day | `https://radiocomercial.pt/now_playing_logs/json/radio-comercial_YYYY-MM-DD.json` |

`radios.py` normalizes all three into a common `Track` record (station, date, hour, track, artist) and writes them to `radio_tracks.xlsx`, deduplicating against whatever is already in the file so it's safe to run repeatedly.

## Sample data

| Station | Date | Hour | Track | Artist |
|---|---|---|---|---|
| RFM | 2026-09-09 | 07:02 | ILOVEITILOVEIT | Bella Kay |
| Mega Hits | 2026-09-09 | 12:18 | Remedied | Flo |
| Rádio Comercial | 2026-09-09 | 00:01 | Refuge | Dermot Kennedy |

## Requirements

- Python version pinned in `.python-version`
- Dependencies declared in `pyproject.toml` (`requests`, `beautifulsoup4`, `openpyxl`)
- [uv](https://docs.astral.sh/uv/) for dependency management

Install with:

```bash
uv sync
```

## Usage

```bash
uv run radios.py
```

This fetches **yesterday's** full day of data for every configured station (RFM and Mega Hits only expose "today"/"yesterday", so "yesterday" guarantees a complete 24-hour window) and appends any new rows to `radio_tracks.xlsx`.

Run it once a day (e.g. via `cron`, calling `uv run radios.py`) to build up a continuous history.

### Output

`radio_tracks.xlsx` has one sheet, `Tracks`, with the columns:

- **Station** — RFM / Mega Hits / Rádio Comercial
- **Date** — the calendar day the track played
- **Hour** — timestamp as reported by the station (format varies slightly by source)
- **Track** — song title
- **Artist** — artist name(s)

Close the file in Excel before running the script, or the write may fail (`.~lock.radio_tracks.xlsx#` indicates it's currently open).

## Adding another station

Two station types are supported:

- **`AjaxStationConfig`** — for stations exposing an ASP.NET AJAX endpoint that returns HTML per hour. Needs an `endpoint`, `referer`, a `build_payload(hour)` function, and a `parse_response(html)` function that extracts `(hour, title, artist)` tuples from that station's specific HTML structure.
- **`JsonLogStationConfig`** — for stations publishing a JSON log per day. Just needs a `url_template` containing `{date}`.

Add a new instance of whichever fits, and append it to the `STATIONS` list.

## Notes

- Requests are rate-limited with a short delay between hourly calls to avoid hammering the stations' servers.
- Some fields (e.g. Rádio Comercial's `MCR` block) can be `null` for a given track; the parser falls back to the always-present `ZENON` fields for title/artist.

## License

Code is licensed under the [MIT License](LICENSE). The collected data (song/artist/airtime facts) is not subject to copyright and is released into the public domain — use it freely, attribution appreciated but not required.

