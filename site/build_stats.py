#!/usr/bin/env python3
"""Gera site/data/stats.json e site/data/tracks.json a partir do radio_tracks.csv.

Uso (a partir da raiz do repo):
    python site/build_stats.py                 # lê data/radio_tracks_*.csv (um ficheiro por mês)
    python site/build_stats.py caminho/x.csv   # um CSV ou uma pasta alternativa

Requer: pandas
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ARG = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "data"
OUT = HERE / "data"


def csv_files() -> list[Path]:
    if ARG.is_file():
        return [ARG]
    files = sorted(ARG.glob("radio_tracks_*.csv"))
    if not files:
        sys.exit(f"Nenhum radio_tracks_*.csv encontrado em {ARG}")
    return files

STATIONS = ["RFM", "Rádio Comercial", "Mega Hits"]

# Artistas cujo nome contém vírgula / separador e que não devem ser partidos
PROTECTED = {"Tyler, The Creator": "Tyler The Creator"}

# Escalões de rotação: passagens por semana (média nos dias com dados)
ROTATION_EDGES = [1, 3, 7, 14]
ROTATION_LABELS = ["menos de 1 por semana", "1 a 3", "3 a 7", "7 a 14", "mais de 14"]


# --------------------------------------------------------------------------
# Normalização
# --------------------------------------------------------------------------
def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm(s: str) -> str:
    s = strip_accents(s).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_track(s: str) -> str:
    # ignora sufixos entre parênteses, ex.: "(PI)", "(Radio Edit)"
    return norm(re.sub(r"[\(\[].*?[\)\]]", " ", s))


_SPLIT = re.compile(r"\s*(?:,|;|\bfeat\.?|\bfeaturing\b|\bft\.?|\bx\b|\bvs\.?)\s*", re.I)


def split_artists(raw: str) -> list[str]:
    for k, v in PROTECTED.items():
        raw = re.sub(re.escape(k), v, raw, flags=re.I)
    parts = [p.strip() for p in _SPLIT.split(raw) if p and p.strip()]
    return parts or [raw.strip()]


_CONNECTORS = {"x", "feat", "ft", "vs"}


def pretty(s: str) -> str:
    """TUDO MAIÚSCULAS -> Capitalizado (só quando a fonte vem em maiúsculas)."""
    return re.sub(
        r"[A-Za-zÀ-ÿ']+",
        lambda m: m.group(0) if m.group(0) in _CONNECTORS else m.group(0).capitalize(),
        s,
    )


def shouting(s: str) -> bool:
    """True se o texto está em maiúsculas, ignorando conectores em minúsculas (x, feat.)."""
    return re.sub(r"\b(?:x|feat|ft|vs)\b\.?", "", s).isupper()


def pick_display(variants: Counter) -> str:
    mixed = [(c, v) for v, c in variants.items() if not shouting(v)]
    if mixed:
        return max(mixed)[1]
    return pretty(variants.most_common(1)[0][0])


# --------------------------------------------------------------------------
# Leitura e limpeza
# --------------------------------------------------------------------------
def load() -> pd.DataFrame:
    files = csv_files()
    print("A ler:", ", ".join(f.name for f in files))
    df = pd.concat((pd.read_csv(f, dtype=str) for f in files), ignore_index=True).fillna("")
    df["Date"] = pd.to_datetime(df["Date"], format="mixed").dt.strftime("%Y-%m-%d")
    for col in ("Station", "Hour", "Track", "Artist"):
        df[col] = df[col].str.strip()
    df = df[(df["Track"] != "") & df["Station"].isin(STATIONS)]
    before = len(df)
    df = df.drop_duplicates(["Station", "Date", "Hour", "Track", "Artist"])
    print(f"{before - len(df)} linhas duplicadas removidas")
    df["h"] = df["Hour"].str[:2].astype(int)
    return df.reset_index(drop=True)


def main() -> None:
    df = load()
    OUT.mkdir(exist_ok=True)

    station_days = {st: set(df.loc[df.Station == st, "Date"]) for st in STATIONS}
    n_days = {st: max(len(station_days[st]), 1) for st in STATIONS}
    total_plays = {st: int((df.Station == st).sum()) for st in STATIONS}

    # --- agregações -------------------------------------------------------
    song_by_st = defaultdict(Counter)        # skey -> {station: plays}
    song_variants = defaultdict(Counter)     # skey -> {(track, artist): n}
    song_dates = defaultdict(list)           # skey -> [datas]
    artist_by_st = defaultdict(Counter)      # akey -> {station: plays}
    artist_variants = defaultdict(Counter)
    hourly = {st: Counter() for st in STATIONS}
    daily = {st: Counter() for st in STATIONS}

    for st, date, h, track, artist in zip(df.Station, df.Date, df.h, df.Track, df.Artist):
        artists = split_artists(artist) if artist else ["Desconhecido"]
        skey = f"{norm_track(track)}|{norm(artists[0])}"
        song_by_st[skey][st] += 1
        song_variants[skey][(track, artist)] += 1
        song_dates[skey].append(date)
        for a in dict.fromkeys(artists):  # cada artista conta 1x por passagem
            ak = norm(a)
            artist_by_st[ak][st] += 1
            artist_variants[ak][a] += 1
        hourly[st][int(h)] += 1
        daily[st][date] += 1

    # nomes de apresentação
    songs = {}
    for k, by in song_by_st.items():
        tv = Counter()
        av = Counter()
        for (t, a), n in song_variants[k].items():
            tv[t] += n
            av[a] += n
        songs[k] = {
            "track": pick_display(tv),
            "artist": pick_display(av) if av else "",
            "by": {st: by[st] for st in STATIONS if by[st]},
            "plays": sum(by.values()),
            "first": min(song_dates[k]),
            "last": max(song_dates[k]),
        }
    artists = {
        k: {
            "name": pick_display(artist_variants[k]),
            "by": {st: by[st] for st in STATIONS if by[st]},
            "plays": sum(by.values()),
        }
        for k, by in artist_by_st.items()
    }

    # --- rankings ---------------------------------------------------------
    def top(items, st=None, n=15, key="plays"):
        if st:
            items = [x for x in items if st in x["by"]]
            ranked = sorted(items, key=lambda x: (-x["by"][st], x.get("track", x.get("name", ""))))[:n]
            return [{**x, "plays": x["by"][st], "by": {st: x["by"][st]}} for x in ranked]
        return sorted(items, key=lambda x: (-x[key], x.get("track", x.get("name", ""))))[:n]

    def slim_song(x):
        return {"track": x["track"], "artist": x["artist"], "plays": x["plays"], "by": x["by"]}

    top_songs = {"Todas": [slim_song(x) for x in top(list(songs.values()))]}
    top_artists = {"Todas": top(list(artists.values()))}
    for st in STATIONS:
        top_songs[st] = [slim_song(x) for x in top(list(songs.values()), st)]
        top_artists[st] = top(list(artists.values()), st)
    for lst in top_artists.values():
        for x in lst:
            x.pop("track", None)

    # --- KPIs por estação ------------------------------------------------
    per_station = {}
    for st in STATIONS:
        plays = [x["by"][st] for x in songs.values() if st in x["by"]]
        plays_sorted = sorted(plays, reverse=True)
        per_station[st] = {
            "plays": total_plays[st],
            "days": len(station_days[st]),
            "plays_per_day": round(total_plays[st] / n_days[st], 1),
            "unique_songs": len(plays),
            "unique_artists": sum(1 for a in artists.values() if st in a["by"]),
            "avg_plays_per_song": round(total_plays[st] / max(len(plays), 1), 1),
            "top10_share": round(sum(plays_sorted[:10]) / max(total_plays[st], 1), 4),
            "played_once_share": round(sum(1 for p in plays if p == 1) / max(len(plays), 1), 4),
        }

    # --- rotação (passagens por semana) ----------------------------------
    def bucket(rate: float) -> int:
        for i, edge in enumerate(ROTATION_EDGES):
            if rate < edge:
                return i
        return len(ROTATION_EDGES)

    nb = len(ROTATION_LABELS)
    rot_songs = {st: [0] * nb for st in STATIONS}
    rot_plays = {st: [0] * nb for st in STATIONS}
    for x in songs.values():
        for st, n in x["by"].items():
            b = bucket(n / n_days[st] * 7)
            rot_songs[st][b] += 1
            rot_plays[st][b] += n
    rotation = {
        "labels": ROTATION_LABELS,
        "songs_share": {st: [round(v / max(sum(rot_songs[st]), 1), 4) for v in rot_songs[st]] for st in STATIONS},
        "plays_share": {st: [round(v / max(sum(rot_plays[st]), 1), 4) for v in rot_plays[st]] for st in STATIONS},
    }

    # --- sobreposição entre rádios --------------------------------------
    sets = {st: {k for k, x in songs.items() if st in x["by"]} for st in STATIONS}
    # containment[a][b] = fração das músicas de `a` que também passam em `b`
    containment = {
        a: {b: round(len(sets[a] & sets[b]) / max(len(sets[a]), 1), 4) for b in STATIONS}
        for a in STATIONS
    }
    cats = ["only", "two", "three"]
    plays_share = {}
    songs_share = {}
    for st in STATIONS:
        pc, sc = Counter(), Counter()
        for k in sets[st]:
            c = cats[len(songs[k]["by"]) - 1]
            pc[c] += songs[k]["by"][st]
            sc[c] += 1
        plays_share[st] = [round(pc[c] / max(total_plays[st], 1), 4) for c in cats]
        songs_share[st] = [round(sc[c] / max(len(sets[st]), 1), 4) for c in cats]

    in_all = sorted((x for x in songs.values() if len(x["by"]) == len(STATIONS)), key=lambda x: -x["plays"])[:10]
    exclusive = {
        st: [slim_song(x) for x in sorted((x for x in songs.values() if list(x["by"]) == [st]), key=lambda x: -x["plays"])[:5]]
        for st in STATIONS
    }
    overlap = {
        "containment": containment,
        "plays_share": plays_share,
        "songs_share": songs_share,
        "categories": ["Só nesta rádio", "Em 2 rádios", "Nas 3 rádios"],
        "in_all": [slim_song(x) for x in in_all],
        "exclusive": exclusive,
        "songs_in_all": sum(1 for x in songs.values() if len(x["by"]) == len(STATIONS)),
    }

    # --- série diária e cobertura ---------------------------------------
    all_dates = sorted(df.Date.unique())
    full_range = [d.strftime("%Y-%m-%d") for d in pd.date_range(all_dates[0], all_dates[-1])]
    missing = [d for d in full_range if d not in set(all_dates)]
    daily_out = {"dates": full_range, "by_station": {st: [daily[st].get(d, 0) for d in full_range] for st in STATIONS}}

    stats = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "stations": STATIONS,
        "period": {"start": all_dates[0], "end": all_dates[-1], "days_with_data": len(all_dates),
                   "days_span": len(full_range), "missing_days": missing},
        "totals": {
            "plays": int(len(df)),
            "unique_songs": len(songs),
            "unique_artists": len(artists),
        },
        "per_station": per_station,
        "top_songs": top_songs,
        "top_artists": top_artists,
        "hourly": {st: [round(hourly[st].get(h, 0) / n_days[st], 2) for h in range(24)] for st in STATIONS},
        "daily": daily_out,
        "rotation": rotation,
        "overlap": overlap,
    }
    (OUT / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # índice para a pesquisa (formato compacto)
    tracks = sorted(songs.values(), key=lambda x: -x["plays"])
    index = {
        "stations": STATIONS,
        "tracks": [[x["track"], x["artist"], *[x["by"].get(st, 0) for st in STATIONS], x["first"], x["last"]] for x in tracks],
    }
    (OUT / "tracks.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"{len(df)} passagens | {len(songs)} músicas | {len(artists)} artistas | "
          f"{len(all_dates)} dias com dados ({len(missing)} em falta)")


if __name__ == "__main__":
    main()