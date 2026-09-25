#!/usr/bin/env python3
"""Download free-licence photos for the RBMOTD player pool from Wikimedia Commons.

Run from the project folder:
    python tools/fetch_photos.py            # fetch photos for players that don't have one
    python tools/fetch_photos.py --force    # re-download everything
    python tools/fetch_photos.py --only "Titus Bramble"

For each player it:
  1. looks up their Wikipedia page (the "wiki" title in the JSON) and checks it's a footballer,
  2. takes the page's lead photo, only if it's hosted on Wikimedia Commons (i.e. free to reuse),
  3. downloads a small version into static/img/rbmotd/ and records the photo credit.

Players without a usable photo are left out of the game automatically.
Open tools/photo_report.html afterwards to eyeball every photo.
"""
import argparse
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "static", "data", "rbmotd.json")
IMG_DIR = os.path.join(ROOT, "static", "img", "rbmotd")
REPORT = os.path.join(ROOT, "tools", "photo_report.html")
WIKI_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
UA = "RBMOTD-photo-fetcher/1.0 (private hobby app; https://rbmotd.pythonanywhere.com)"
SIZE = (360, 432)  # 5:6 portrait

try:
    from PIL import Image  # optional: crops and shrinks the photos
except ImportError:
    Image = None


def get(url, params=None, tries=3):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def get_json(url, params):
    return json.loads(get(url, params).decode("utf-8"))


def clean(s):
    s = html.unescape(re.sub(r"<[^>]+>", "", s or ""))
    return re.sub(r"\s+", " ", s).strip()


def slug(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def wiki_photo(title):
    """Returns (commons_filename, error)."""
    d = get_json(WIKI_API, {"action": "query", "format": "json", "formatversion": 2, "redirects": 1,
                            "titles": title, "prop": "pageimages|pageprops|description",
                            "piprop": "name", "ppprop": "disambiguation"})
    pages = d.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return None, "no Wikipedia page with that title"
    p = pages[0]
    if "disambiguation" in p.get("pageprops", {}):
        return None, "title is a disambiguation page"
    desc = p.get("description", "")
    if not re.search(r"football|soccer", desc, re.I):
        return None, f"page doesn't look like a footballer ({desc or 'no description'})"
    name = p.get("pageimage")
    if not name:
        return None, "no free photo on the Wikipedia page"
    return name, None


def commons_file(filename):
    """Returns (info, error). Only files hosted on Commons count, since those are free to reuse."""
    d = get_json(COMMONS_API, {"action": "query", "format": "json", "formatversion": 2,
                               "titles": "File:" + filename, "prop": "imageinfo",
                               "iiprop": "url|mime|extmetadata", "iiurlwidth": 600})
    pages = d.get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing") or not pages[0].get("imageinfo"):
        return None, "photo isn't on Wikimedia Commons"
    ii = pages[0]["imageinfo"][0]
    if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"):
        return None, f"unsupported image type ({ii.get('mime')})"
    meta = ii.get("extmetadata", {})
    artist = clean(meta.get("Artist", {}).get("value")) or "Unknown"
    if len(artist) > 60:
        artist = artist[:57].rstrip() + "…"
    return {
        "url": ii.get("thumburl") or ii["url"],
        "page": ii.get("descriptionurl"),
        "license": clean(meta.get("LicenseShortName", {}).get("value")) or "see source",
        "artist": artist,
    }, None


def save_image(data, path_no_ext):
    """Crop to a 5:6 portrait (keeping the top, where faces usually are) and shrink."""
    if Image is None:
        ext = ".png" if data[:8] == b"\x89PNG\r\n\x1a\n" else ".jpg"
        with open(path_no_ext + ext, "wb") as f:
            f.write(data)
        return path_no_ext + ext
    im = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = im.size
    target = SIZE[0] / SIZE[1]
    if w / h > target:  # too wide: trim the sides
        nw = int(h * target)
        left = (w - nw) // 2
        im = im.crop((left, 0, left + nw, h))
    else:  # too tall: keep near the top
        nh = int(w / target)
        top = int((h - nh) * 0.15)
        im = im.crop((0, top, w, top + nh))
    im = im.resize(SIZE, Image.LANCZOS)
    im.save(path_no_ext + ".jpg", "JPEG", quality=82, optimize=True)
    return path_no_ext + ".jpg"


def write_report(players, problems):
    cards = []
    for p in players:
        if p.get("image"):
            cards.append(f'<figure><img src="../{html.escape(p["image"].lstrip("/"))}" loading="lazy">'
                         f'<figcaption><b>{html.escape(p["name"])}</b><br>{html.escape(p.get("credit") or "")}</figcaption></figure>')
    missing = "".join(f"<li><b>{html.escape(n)}</b>: {html.escape(why)}</li>" for n, why in problems)
    page = f"""<!doctype html><meta charset="utf-8"><title>RBMOTD photos</title>
<style>body{{font:14px system-ui;margin:24px;background:#0E4A36;color:#F4F7F1}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}}
figure{{margin:0}}img{{width:100%;aspect-ratio:5/6;object-fit:cover;border-radius:10px;background:#113}}
figcaption{{font-size:11px;opacity:.8;margin-top:4px}}li{{margin:4px 0}}</style>
<h1>RBMOTD photos: {sum(1 for p in players if p.get("image"))} with photos</h1>
<p>Check each photo shows the right player. If one is wrong, set that player's "image" to null in static/data/rbmotd.json and delete the file.</p>
<div class="grid">{''.join(cards)}</div>
<h2>No photo ({len(problems)}) – left out of the game</h2><ul>{missing}</ul>"""
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write(page)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="re-download photos that already exist")
    ap.add_argument("--only", help="just this player (exact name)")
    args = ap.parse_args()

    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    players = data["players"]
    os.makedirs(IMG_DIR, exist_ok=True)
    if Image is None:
        print("Note: Pillow isn't installed, so photos are saved uncropped. `pip install Pillow` for neater photos.\n")

    problems = []
    got = 0
    for p in players:
        if args.only and p["name"] != args.only:
            continue
        existing = p.get("image") and os.path.exists(os.path.join(ROOT, p["image"].lstrip("/")))
        if existing and not args.force:
            got += 1
            continue
        try:
            fname, why = wiki_photo(p.get("wiki") or p["name"])
            info = None
            if fname:
                info, why = commons_file(fname)
            if not info:
                p["image"] = p["credit"] = p["source"] = None
                problems.append((p["name"], why))
                print(f"  ✗ {p['name']}: {why}")
                continue
            path = save_image(get(info["url"]), os.path.join(IMG_DIR, slug(p["name"])))
            p["image"] = "/" + os.path.relpath(path, ROOT).replace(os.sep, "/")
            p["credit"] = f"Photo: {info['artist']}, {info['license']}, via Wikimedia Commons"
            p["source"] = info["page"]
            got += 1
            print(f"  ✓ {p['name']}")
        except Exception as e:
            problems.append((p["name"], f"error: {e}"))
            print(f"  ! {p['name']}: {e}")
        time.sleep(0.25)  # be polite to Wikimedia

    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    write_report(players, problems)
    print(f"\n{got} players have photos, {len(problems)} don't (they're left out of the game).")
    print(f"Check them all here: {REPORT}")


if __name__ == "__main__":
    sys.exit(main())
