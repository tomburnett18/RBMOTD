# RBMOTD

Football mini-games for the pub, built as a Progressive Web App (PWA) with a small Flask backend. Hosted at **rbmotd.pythonanywhere.com**.

## What's in Phase 1

| Game | Modes available now |
|---|---|
| RBMOTD (Random Barclays Man of the Day) | Today's player (scored, on the leaderboard), practice |
| Guess the XI | Solo (easy / medium / hard), 2-player pass the phone |
| Pub Quiz | Solo, pass the phone (2–8 players, with numeric tiebreaker) |
| FWORDLE (Football Wordle) | Daily, practice |
| Imposter | Pass the phone (3–12 players, 1–3 imposters, topic filters) |

**Phase 3** will add hosted lobbies so friends can play on their own phones.

## Project layout

```
app.py                  Flask app: pages, accounts, daily game, leaderboard
models.py               Database tables
rbmotd_core.py          Daily game rules: name matching, hints, scoring, drop times
notify.py               Sending emails
manage.py               Admin commands (setup, daily email task)
.env                    Your settings and passwords (never committed)
data/rbmotd.json        RBMOTD players – kept out of static/ so nobody can look up the answer
instance/rbmotd.db      The database (created on first run)
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

## Setting up accounts and the daily email

Do this once, after the deployment steps above.

### 1. Settings file
Copy `.env.example` to `.env` and fill it in. `.env` holds passwords, so it's never committed.

```
cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"    # paste as SECRET_KEY
```

Set `BASE_URL` to `https://rbmotd.pythonanywhere.com` so links in emails work.

### 2. Email
With Gmail: turn on 2-step verification on the account, create an app password at
https://myaccount.google.com/apppasswords, and paste it as `SMTP_PASSWORD` (16 letters, no spaces).
Gmail allows around 500 emails a day, which is plenty. Brevo settings are in `.env.example` if you'd rather use that.

Check it works:
```
python manage.py test-email you@example.com
```

### 3. Database
```
python manage.py init
```

### 4. The daily email
On PythonAnywhere, go to the **Tasks** tab and add an **hourly task** at minute `00`:

```
python3.12 /home/rbmotd/RBMOTD/manage.py drop-check
```

Each hour this checks when today's player drops. If the drop is within the next hour it waits
for that exact minute and emails everyone; otherwise it does nothing. The game itself unlocks on
time regardless, so a missed task only delays the email.

Useful commands:
```
python manage.py today     # today's drop time and player (spoiler!)
python manage.py users     # who's signed up
```

### Notes
- Reload the web app on the **Web** tab after any code change.
- The database lives in `instance/rbmotd.db`. Back it up by downloading that file.
- Accounts are for you and your mates: anyone with the address can sign up, so don't share it widely.

## Adding to your home screen
- **iPhone (Safari):** Share button → *Add to Home Screen*.
- **Android (Chrome):** menu → *Add to Home screen* / *Install app*.

## RBMOTD photos

Player photos come from Wikimedia Commons (free to reuse with credit) and are stored in `static/img/rbmotd/`. Only players with a photo appear in the game.

To download or refresh them, run this from the project folder (it takes a few minutes):
```
pip install Pillow
python tools/fetch_photos.py
```
Then open `tools/photo_report.html` in your browser to check every photo shows the right player. If one is wrong, set that player's `"image"` to `null` in `static/data/rbmotd.json` and delete the file.

To add a player, add them to `static/data/rbmotd.json` with their exact Wikipedia page title in `"wiki"`, then run the script again. It only fetches players who don't have a photo yet (use `--force` to redo all of them).

## Editing the game data

All content lives in `static/data/`. It's a starter set written from memory, so please check it.

- **`gts11.json`** – matches for Guess the XI. Each line-up is a list of rows from goalkeeper to attack, which is how they're laid out on the pitch. `difficulty` is `easy`, `medium` or `hard`.
- **`rbmotd.json`** – the RBMOTD player pool. `wiki` is the player's Wikipedia page title, used to find their photo; `image`, `credit` and `source` are filled in by the photo script.
- **`fwordle.json`** – FWORDLE words. `answers` are the surnames that can come up (with the players shown after the game); `valid` is every surname accepted as a guess. Five letters only, capitals, no accents. The daily order is fixed, so adding answers changes which name comes up on future days.
- **`quiz.json`** – quiz questions. `mc` questions have three `options` and the index of the right `answer` (0, 1 or 2). `text` questions list every accepted spelling in `answers`. `tiebreakers` need a number answer.
- **`imposter.json`** – players with their leagues, eras, nationality and whether they won a World Cup (`wc`).

Player names from every file feed the autocomplete dropdown, so the dropdown never gives the answer away.

## Game rules as built

- **RBMOTD scoring:** start on 1,000 points and lose 10 for every second you take, so nothing after 100 seconds. The same in the daily game and practice. Wrong guesses are unlimited and each one reveals a hint.
- **The daily player:** one player a day, the same for everyone, dropping at a random time between 9:30am and 4:30pm UK time, never between 12 and 2. Your clock starts when you tap Start, not when the email arrives. The answer is checked on the server, so it can't be found by poking around in the app's files.
- **Pub Quiz scoring:** wrong = 0. Right = 1,000 if answered within a second, dropping steadily to 350 at 20 seconds and staying at 350 after that.
- **FWORDLE:** five-letter footballer surnames, six guesses, Wordle colours. The daily name is the same for everyone and changes at midnight UK time. Streaks and stats are saved on each phone.
- **Guess the XI, 2 players:** both players guess the same hidden XI. A right answer scores a point and you go again; a miss passes the turn over. Most of the XI wins, or end early and the higher score wins.
- **Imposter:** crew win when every imposter is voted out; imposters win when they match or outnumber the crew.
