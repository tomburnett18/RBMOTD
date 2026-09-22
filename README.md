# RBMOTD

Football mini-games for the pub, built as a Progressive Web App (PWA) with a small Flask backend. Hosted at **rbmotd.pythonanywhere.com**.

## What's in Phase 1

| Game | Modes available now |
|---|---|
| RBMOTD (Random Barclays Man of the Day) | Practice (unlimited, not saved) |
| Guess the XI | Solo (easy / medium / hard), 1v1 pass the phone |
| Pub Quiz | Solo, pass the phone (2–8 players, with numeric tiebreaker) |
| Football 501 | Solo, pass the phone |
| Imposter | Pass the phone (3–12 players, 1–3 imposters, topic filters) |

**Phase 2** adds sign-up, the official daily RBMOTD (timer starts when you open it), the leaderboard, and push + email notifications.
**Phase 3** adds hosted lobbies so friends can play on their own phones.

## Project layout

```
app.py                  Flask app (serves the page, service worker, manifest)
requirements.txt
templates/index.html    App shell
static/css/app.css      All styling
static/js/app.js        Router, shared helpers, homepage
static/js/games/        One file per game
static/data/            Game data (JSON) – edit these to add content
static/icons/           App icons
static/sw.js            Service worker (offline + installable)
static/manifest.webmanifest
```

## Deploying to PythonAnywhere

1. **Push this code to GitHub** (from your computer, inside your cloned repo):
   ```bash
   git add .
   git commit -m "Phase 1"
   git push
   ```
2. **Open a Bash console on PythonAnywhere** and clone the repo:
   ```bash
   git clone https://github.com/tomburnett18/RBMOTD.git
   cd RBMOTD
   pip3.12 install --user -r requirements.txt
   ```
3. **Create the web app**: go to the *Web* tab, click *Add a new web app*, choose **Manual configuration** and **Python 3.12**.
4. **Edit the WSGI file** (link on the Web tab). Delete everything in it and paste:
   ```python
   import sys
   path = "/home/rbmotd/RBMOTD"
   if path not in sys.path:
       sys.path.insert(0, path)
   from app import app as application
   ```
   Change `rbmotd` in the path if your PythonAnywhere username is different.
5. **Add a static files mapping** on the Web tab:
   URL `/static/` → Directory `/home/rbmotd/RBMOTD/static`
6. **Force HTTPS**: turn on *Force HTTPS* on the Web tab. The app needs HTTPS to be installable.
7. Click **Reload**, then open https://rbmotd.pythonanywhere.com.

### Updating later
```bash
cd ~/RBMOTD && git pull
```
Then press **Reload** on the Web tab. If you change any files, also bump `APP_VERSION` in `app.py` and `CACHE` in `static/sw.js` so phones fetch the new version.

## Adding to your home screen
- **iPhone (Safari):** Share button → *Add to Home Screen*.
- **Android (Chrome):** menu → *Add to Home screen* / *Install app*.

## Editing the game data

All content lives in `static/data/`. It's a starter set written from memory, so please check it.

- **`gts11.json`** – matches for Guess the XI. Each line-up is a list of rows from goalkeeper to attack, which is how they're laid out on the pitch. `difficulty` is `easy`, `medium` or `hard`.
- **`rbmotd.json`** – the RBMOTD player pool. To show a photo instead of the silhouette, set `image` to a Wikimedia Commons image URL and `credit` to the attribution (for example `"Photo: Jane Smith, CC BY-SA 4.0, via Wikimedia Commons"`).
- **`f501.json`** – 501 topics and each player's number. Any player not listed counts as "not on the list", so longer lists make better games. Two-player games only pick topics with at least 1,200 in valid numbers (180 or under, not 159/162/163/165/166/168/169), because both players share the pool. Smaller topics are still used in solo. Include some low numbers too, so every finish is reachable.
- **`quiz.json`** – quiz questions. `mc` questions have three `options` and the index of the right `answer` (0, 1 or 2). `text` questions list every accepted spelling in `answers`. `tiebreakers` need a number answer.
- **`imposter.json`** – players with their leagues, eras, nationality and whether they won a World Cup (`wc`).

Player names from every file feed the autocomplete dropdown, so the dropdown never gives the answer away.

## Game rules as built

- **RBMOTD scoring:** 1,000 points if guessed within a minute, dropping steadily to 100 at one hour. Wrong guesses are unlimited; each one reveals a hint.
- **Pub Quiz scoring:** wrong = 0. Right = 1,000 if answered within a second, dropping steadily to 350 at 20 seconds and staying at 350 after that.
- **Football 501:** start on 501. Finishing between 0 and −10 checks you out; below −10 is bust and your score stays. Answers over 180 or on an impossible darts checkout are invalid. Invalid answers, unknown players and repeats cost your turn. Answers are a shared pool: once either player has used a name, nobody can use it again. In two-player games the round is completed after a checkout, and whoever is closest to 0 wins. If both players pass in the same round, the game ends and the lower score wins.
- **Guess the XI 1v1:** one guess per turn, right or wrong. First to all 11 wins, or end the game early and the higher score wins.
- **Imposter:** crew win when every imposter is voted out; imposters win when they match or outnumber the crew.
