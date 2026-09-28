"""Game logic for the daily RBMOTD that must live on the server:
name matching, hints, scoring and drop times. Mirrors the rules in static/js."""
import json
import os
import re
import secrets
import unicodedata
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

BASEDIR = os.path.dirname(os.path.abspath(__file__))
POOL_PATH = os.path.join(BASEDIR, "data", "rbmotd.json")
LONDON = ZoneInfo("Europe/London")

DROP_START = time(9, 30)        # earliest drop, UK time
DROP_WINDOW_MIN = 7 * 60        # latest drop is 16:30
LUNCH_FROM_MIN = 150            # 12:00, measured from 09:30
LUNCH_MINUTES = 120             # no drops between 12:00 and 14:00

_cache = {"mtime": None, "players": []}


def players():
    """The player pool, reloaded automatically when the JSON file changes."""
    mtime = os.path.getmtime(POOL_PATH)
    if _cache["mtime"] != mtime:
        with open(POOL_PATH, encoding="utf-8") as f:
            _cache["players"] = json.load(f)["players"]
        _cache["mtime"] = mtime
    return _cache["players"]


def playable():
    """Players used in the daily game and practice: those with a photo, if any have one."""
    pool = players()
    with_photo = [p for p in pool if p.get("image")]
    return with_photo or pool


def player_by_id(pid):
    return next((p for p in players() if p["id"] == pid), None)


# ---------------- Names ----------------
_SPECIAL = str.maketrans({"ø": "o", "ł": "l", "ð": "d", "đ": "d", "ı": "i", "æ": "ae", "ß": "ss"})
_PARTICLES = {"van", "von", "der", "den", "de", "di", "da", "dos", "du", "le", "la", "mac", "el"}


def norm(s):
    s = str(s or "").lower().translate(_SPECIAL)
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def surname(name):
    parts = name.strip().split()
    if len(parts) == 1:
        return parts[0]
    if re.fullmatch(r"[A-Z][a-z]{1,3} [A-Z][a-z]+-[a-z]+", name.strip()):
        return parts[0]  # Korean family-name-first, e.g. Park Ji-sung
    i = len(parts) - 1
    while i > 1 and parts[i - 1].lower() in _PARTICLES:
        i -= 1
    if i == 1 and parts[0].lower() in _PARTICLES:
        i = 0
    return " ".join(parts[i:])


def name_matches(guess, name, aliases=()):
    g = norm(guess)
    if not g:
        return False
    full = norm(name)
    if g == full or any(norm(a) == g for a in aliases):
        return True
    sur = norm(surname(name))
    if g == sur and len(sur) > 2:
        return True
    last = full.split(" ")[-1]
    return g == last and len(last) > 3


# ---------------- Scoring & hints ----------------
def points(secs):
    """Start on 1000 and lose 10 points for every second taken. Zero after 100 seconds."""
    return max(0, 1000 - 10 * int(secs))


def build_hints(p):
    first = p["name"].split()[0]
    sur = surname(p["name"])
    one = " " not in p["name"]
    clubs = p["clubs"]
    return [
        {"k": "Position", "v": p["position"]},
        {"k": "Nationality", "v": p["nationality"]},
        {"k": "Played for", "v": clubs[-1]},
        {"k": "Fact", "v": p["fact"]},
        {"k": "Also played for", "v": ", ".join(clubs[:-1]) if len(clubs) > 1 else clubs[0]},
        {"k": "Name", "v": f"One name, starts with {p['name'][0]}"} if one else {"k": "Surname starts with", "v": sur[0]},
        {"k": "Name length", "v": f"{len(p['name'])} letters"} if one else {"k": "First name starts with", "v": first[0]},
        {"k": "Letters in the name", "v": str(len(norm(p["name"]).replace(" ", "")))},
    ]


# ---------------- Time ----------------
def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def london_today():
    return datetime.now(LONDON).date()


def random_drop_utc(day):
    """A random minute between 09:30 and 16:30 UK time, never during lunch (12:00-14:00)."""
    minute = secrets.randbelow(DROP_WINDOW_MIN + 1 - LUNCH_MINUTES)
    if minute >= LUNCH_FROM_MIN:
        minute += LUNCH_MINUTES
    local = datetime.combine(day, DROP_START, tzinfo=LONDON) + timedelta(minutes=minute)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def to_london(dt_utc):
    return dt_utc.replace(tzinfo=timezone.utc).astimezone(LONDON)
