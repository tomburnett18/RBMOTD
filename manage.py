#!/usr/bin/env python3
"""Admin commands for RBMOTD.

    python manage.py init                 create the database
    python manage.py today                show today's drop time and player (spoiler!)
    python manage.py drop-check           send the daily email when the drop time arrives
    python manage.py test-email you@x.com send a test email to check your settings
    python manage.py users                list who's signed up

`drop-check` is what PythonAnywhere runs every hour. It works out whether today's drop
falls within the next hour, waits for it, then emails everyone. It does nothing if the
drop is later today or the email has already gone out.
"""
import sys
import time

from app import BASE_URL, app, core, db, get_daily, send_drop_email
from models import Attempt, User
import notify


def init():
    with app.app_context():
        db.create_all()
    print("Database ready.")


def today():
    with app.app_context():
        d = get_daily()
        p = core.player_by_id(d.player_id)
        drop = core.to_london(d.drop_at)
        played = Attempt.query.filter_by(day=d.day).count()
        print(f"{d.day}: drops at {drop:%H:%M} UK time ({'live now' if core.utcnow() >= d.drop_at else 'not yet'})")
        print(f"Player: {p['name']} (spoiler!)")
        print(f"Email sent: {'yes, ' + str(core.to_london(d.notified_at)) if d.notified_at else 'not yet'}")
        print(f"Played today: {played}")


def drop_check():
    with app.app_context():
        d = get_daily()
        if d.notified_at:
            print("Email already sent today.")
            return
        wait = (d.drop_at - core.utcnow()).total_seconds()
        if wait > 3600:
            print(f"Today's drop is at {core.to_london(d.drop_at):%H:%M}, more than an hour away. Nothing to do.")
            return
        if wait > 0:
            print(f"Drop at {core.to_london(d.drop_at):%H:%M} - waiting {int(wait)}s...")
            time.sleep(wait)
        result = send_drop_email(d)
        print(f"Sent: {result}" if result else "Another run got there first.")


def test_email(address):
    with app.app_context():
        if not notify.email_configured():
            print("Email isn't set up. Fill in the SMTP settings in .env.")
            return
        sent, failed = notify.send_email(
            [address], "RBMOTD test email", "If you're reading this, RBMOTD emails work.",
            notify.email_html("Emails are working", "You'll get one of these each day the moment the player drops.", "Open RBMOTD", BASE_URL))
        print(f"Sent {sent}, failed {failed}.")


def users():
    with app.app_context():
        rows = User.query.order_by(User.created_at).all()
        if not rows:
            print("Nobody has signed up yet.")
        for u in rows:
            played = Attempt.query.filter_by(user_id=u.id).count()
            print(f"{u.name:<20} {u.email:<32} {played:>3} days  emails {'on' if u.notify_email else 'off'}")


COMMANDS = {"init": init, "today": today, "drop-check": drop_check, "test-email": test_email, "users": users}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd not in COMMANDS:
        print(__doc__)
        sys.exit(1)
    COMMANDS[cmd](*sys.argv[2:])
