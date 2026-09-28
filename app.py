"""RBMOTD – football games for the pub.

Phase 2: accounts, the daily RBMOTD (served and scored here so nobody can peek at the
answer), the leaderboard, and an email to everyone when the day's player drops.
"""
import logging
import os
import random
import secrets
from datetime import timedelta
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory, session
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

BASEDIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASEDIR, ".env"))

import notify  # noqa: E402  (needs the .env loaded first)
import rbmotd_core as core  # noqa: E402
from models import Attempt, Daily, User, db  # noqa: E402

APP_VERSION = "2.0.0"
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("rbmotd")

app = Flask(__name__, instance_path=os.path.join(BASEDIR, "instance"))
os.makedirs(app.instance_path, exist_ok=True)

BASE_URL = os.environ.get("BASE_URL", "http://localhost:5000").rstrip("/")
secret = os.environ.get("SECRET_KEY")
if not secret:
    log.warning("SECRET_KEY not set in .env - using a temporary one, so sign-ins reset on restart.")
    secret = secrets.token_hex(32)

app.config.update(
    SECRET_KEY=secret,
    SQLALCHEMY_DATABASE_URI="sqlite:///" + os.path.join(app.instance_path, "rbmotd.db"),
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=BASE_URL.startswith("https://"),
    PERMANENT_SESSION_LIFETIME=timedelta(days=365),
)
db.init_app(app)
with app.app_context():
    db.create_all()


# =============================================================
# Helpers
# =============================================================
def err(msg, code=400):
    return jsonify(error=msg), code


def current_user():
    uid = session.get("uid")
    return db.session.get(User, uid) if uid else None


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        user = current_user()
        if not user:
            return err("Sign in to do that.", 401)
        return fn(user, *a, **kw)
    return wrapper


@app.before_request
def json_only_posts():
    # API writes must be JSON. Browsers can't send JSON to another site without
    # permission, so this plus SameSite cookies blocks cross-site form tricks.
    if request.method == "POST" and request.path.startswith("/api/") and not request.is_json:
        return err("Expected JSON.", 415)


def body():
    return request.get_json(silent=True) or {}


def sign_in(user):
    session.clear()
    session.permanent = True
    session["uid"] = user.id


def get_daily(day=None):
    """Today's Daily row, created on first use with a random player and drop time."""
    day = day or core.london_today()
    key = day.isoformat()
    row = db.session.get(Daily, key)
    if row:
        return row
    pool = core.playable()
    recent = [r.player_id for r in Daily.query.order_by(Daily.day.desc()).limit(max(0, len(pool) - 1)).all()]
    choices = [p for p in pool if p["id"] not in recent] or pool
    row = Daily(day=key, player_id=random.choice(choices)["id"], drop_at=core.random_drop_utc(day))
    db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError:  # another request created it at the same moment
        db.session.rollback()
        row = db.session.get(Daily, key)
    return row


def is_live(daily):
    return core.utcnow() >= daily.drop_at


def rank_today(day, attempt):
    """1-based rank among finished attempts today (points first, then time)."""
    rows = Attempt.query.filter(Attempt.day == day, Attempt.finished_at.isnot(None)).all()
    rows.sort(key=lambda a: (-a.points, a.seconds()))
    for i, a in enumerate(rows):
        if a.id == attempt.id:
            return i + 1, len(rows)
    return None, len(rows)


def attempt_state(a, daily):
    p = core.player_by_id(daily.player_id)
    hints = core.build_hints(p)
    state = {
        "started": True,
        "finished": a.finished,
        "seconds": a.seconds(),
        "guesses": a.guesses,
        "hints": hints[: a.hints],
        "hints_left": max(0, len(hints) - a.hints),
        "solved": a.solved,
        "gave_up": a.gave_up,
        "points": a.points,
        "image": p.get("image"),
        "credit": p.get("credit"),
        "source": p.get("source"),
    }
    if a.finished:
        state["player"] = {k: p.get(k) for k in ("name", "nationality", "position", "clubs", "fact", "image", "credit", "source")}
        state["rank"], state["of"] = rank_today(daily.day, a)
    return state


# =============================================================
# Pages
# =============================================================
@app.route("/")
def index():
    return render_template("index.html", version=APP_VERSION)


@app.route("/sw.js")
def service_worker():
    resp = send_from_directory(app.static_folder, "sw.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


@app.route("/manifest.webmanifest")
def manifest():
    return send_from_directory(app.static_folder, "manifest.webmanifest", mimetype="application/manifest+json")


@app.route("/api/health")
def health():
    return jsonify(ok=True, version=APP_VERSION, players=len(core.playable()))


# =============================================================
# Accounts
# =============================================================
@app.get("/api/me")
def me():
    user = current_user()
    return jsonify(user=user.public() if user else None)


@app.post("/api/auth/signup")
def signup():
    d = body()
    name = (d.get("name") or "").strip()[:40]
    email = (d.get("email") or "").strip().lower()
    password = d.get("password") or ""
    if not name:
        return err("Enter the name you want on the leaderboard.")
    if "@" not in email or "." not in email.split("@")[-1]:
        return err("Enter a valid email address.")
    if len(password) < 8:
        return err("Use at least 8 characters for your password.")
    if User.query.filter_by(email=email).first():
        return err("There's already an account with that email. Sign in instead.")
    user = User(name=name, email=email, pw_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    sign_in(user)
    notify.send_email([user.email], "Welcome to RBMOTD",
                      f"You're signed up as {user.name}.\n\nEach day you'll get an email the moment that day's player drops, "
                      f"somewhere between 9:30am and 4:30pm (never over lunch).\n\n{BASE_URL}",
                      notify.email_html("You're in", f"You're on the leaderboard as <b>{user.name}</b>. You'll get an email each day the moment the player drops, somewhere between 9:30am and 4:30pm.", "Open RBMOTD", BASE_URL))
    return jsonify(user=user.public())


@app.post("/api/auth/login")
def login():
    d = body()
    email = (d.get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.pw_hash, d.get("password") or ""):
        return err("That email and password don't match.", 401)
    sign_in(user)
    return jsonify(user=user.public())


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


def _reset_serializer():
    return URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="password-reset")


@app.post("/api/auth/forgot")
def forgot():
    email = (body().get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    if user:
        # Tied to the current password, so the link stops working once it's used.
        token = _reset_serializer().dumps({"uid": user.id, "h": user.pw_hash[-12:]})
        url = f"{BASE_URL}/#/reset/{token}"
        notify.send_email([user.email], "Reset your RBMOTD password",
                          f"Hi {user.name},\n\nReset your password here (the link works for 2 hours):\n{url}\n\nIf you didn't ask for this, ignore this email.",
                          notify.email_html("Reset your password", f"Hi {user.name}, tap below to choose a new password. The link works for 2 hours.", "Reset password", url))
    # Same reply either way, so this can't be used to find out who has an account.
    return jsonify(ok=True)


@app.post("/api/auth/reset")
def reset():
    d = body()
    password = d.get("password") or ""
    if len(password) < 8:
        return err("Use at least 8 characters for your password.")
    try:
        data = _reset_serializer().loads(d.get("token") or "", max_age=2 * 3600)
    except SignatureExpired:
        return err("That reset link has expired. Ask for a new one.")
    except BadSignature:
        return err("That reset link isn't valid. Ask for a new one.")
    user = db.session.get(User, data.get("uid"))
    if not user or user.pw_hash[-12:] != data.get("h"):
        return err("That reset link has already been used. Ask for a new one.")
    user.pw_hash = generate_password_hash(password)
    db.session.commit()
    sign_in(user)
    return jsonify(user=user.public())


@app.post("/api/me/settings")
@login_required
def settings(user):
    d = body()
    if "name" in d:
        name = (d.get("name") or "").strip()[:40]
        if not name:
            return err("Enter a name.")
        user.name = name
    if "notify_email" in d:
        user.notify_email = bool(d["notify_email"])
    db.session.commit()
    return jsonify(user=user.public())


# =============================================================
# RBMOTD
# =============================================================
@app.get("/api/rbmotd/pool")
def rbmotd_pool():
    """Practice players (today's official player left out) and every name for the dropdown."""
    today_id = get_daily().player_id
    pool = core.playable()
    return jsonify(players=[p for p in pool if p["id"] != today_id],
                   names=[p["name"] for p in core.players()])


@app.get("/api/daily")
def daily_status():
    daily = get_daily()
    user = current_user()
    out = {"day": daily.day, "live": is_live(daily), "signed_in": bool(user)}
    if user and out["live"]:
        a = Attempt.query.filter_by(user_id=user.id, day=daily.day).first()
        out["attempt"] = attempt_state(a, daily) if a else None
    return jsonify(out)


@app.post("/api/daily/start")
@login_required
def daily_start(user):
    daily = get_daily()
    if not is_live(daily):
        return err("Today's player hasn't dropped yet.", 409)
    a = Attempt.query.filter_by(user_id=user.id, day=daily.day).first()
    if not a:
        a = Attempt(user_id=user.id, day=daily.day, started_at=core.utcnow())
        db.session.add(a)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            a = Attempt.query.filter_by(user_id=user.id, day=daily.day).first()
    return jsonify(attempt=attempt_state(a, daily))


def _open_attempt(user):
    daily = get_daily()
    a = Attempt.query.filter_by(user_id=user.id, day=daily.day).first()
    if not a:
        return daily, None, err("Start today's player first.", 409)
    if a.finished:
        return daily, a, err("You've already played today's player.", 409)
    return daily, a, None


@app.post("/api/daily/guess")
@login_required
def daily_guess(user):
    guess = (body().get("guess") or "").strip()
    if not guess:
        return err("Type a player's name.")
    daily, a, problem = _open_attempt(user)
    if problem:
        return problem
    p = core.player_by_id(daily.player_id)
    a.guesses += 1
    correct = core.name_matches(guess, p["name"], p.get("aka", []))
    new_hint = None
    if correct:
        now = core.utcnow()
        a.finished_at = now
        a.solved = True
        a.points = core.points(a.seconds(now))
    else:
        hints = core.build_hints(p)
        if a.hints < len(hints):
            new_hint = hints[a.hints]
            a.hints += 1
    db.session.commit()
    return jsonify(correct=correct, hint=new_hint, attempt=attempt_state(a, daily))


@app.post("/api/daily/giveup")
@login_required
def daily_giveup(user):
    daily, a, problem = _open_attempt(user)
    if problem:
        return problem
    a.finished_at = core.utcnow()
    a.gave_up = True
    a.points = 0
    db.session.commit()
    return jsonify(attempt=attempt_state(a, daily))


# =============================================================
# Leaderboard
# =============================================================
@app.get("/api/leaderboard")
@login_required
def leaderboard(user):
    period = request.args.get("period", "today")
    today = core.london_today()
    if period == "today":
        q = (db.session.query(Attempt, User).join(User, User.id == Attempt.user_id)
             .filter(Attempt.day == today.isoformat(), Attempt.finished_at.isnot(None)).all())
        q.sort(key=lambda r: (-r[0].points, r[0].seconds()))
        rows = [{"user_id": u.id, "name": u.name, "points": a.points, "seconds": round(a.seconds()),
                 "guesses": a.guesses, "gave_up": a.gave_up} for a, u in q]
    elif period in ("month", "all"):
        q = (db.session.query(User.id, User.name, func.sum(Attempt.points), func.count(Attempt.id))
             .join(Attempt, Attempt.user_id == User.id).filter(Attempt.finished_at.isnot(None)))
        if period == "month":
            q = q.filter(Attempt.day.like(today.strftime("%Y-%m") + "-%"))
        rows = [{"user_id": uid, "name": name, "points": int(pts or 0), "days": days}
                for uid, name, pts, days in q.group_by(User.id).all()]
        rows.sort(key=lambda r: (-r["points"], -r["days"], r["name"].lower()))
    else:
        return err("Unknown period.")
    last = rank = None
    for i, r in enumerate(rows):  # equal points share a rank
        if r["points"] != last:
            rank, last = i + 1, r["points"]
        r["rank"] = rank
    return jsonify(period=period, rows=rows, me=user.id, month=today.strftime("%B %Y"))


# =============================================================
# The daily email
# =============================================================
def send_drop_email(daily):
    """Email everyone that today's player is live. Safe to call twice: only the first call sends."""
    claimed = db.session.execute(
        update(Daily).where(Daily.day == daily.day, Daily.notified_at.is_(None)).values(notified_at=core.utcnow())
    ).rowcount
    db.session.commit()
    if not claimed:
        log.info("Drop email for %s already sent", daily.day)
        return None
    url = BASE_URL + "/#/rbmotd"
    emails = [u.email for u in User.query.filter_by(notify_email=True).all()]
    sent, failed = notify.send_email(
        emails, "Today's RBMOTD has dropped",
        "Today's Random Barclays Man of the Day is live.\n\nYou start on 1,000 points and lose 10 for every second you take, "
        f"and the clock starts the moment you open it:\n{url}\n\nTurn these emails off in your account on RBMOTD.",
        notify.email_html("Today's player has dropped",
                          "Name him fast. You start on 1,000 points and lose 10 for every second you take, and the clock starts the moment you open the game.",
                          "Play now", url))
    log.info("Drop email for %s: %d sent, %d failed", daily.day, sent, failed)
    return {"sent": sent, "failed": failed}


if __name__ == "__main__":
    app.run(debug=True)
