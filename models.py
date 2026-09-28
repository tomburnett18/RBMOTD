"""Database tables. SQLite file lives in instance/rbmotd.db."""
from flask_sqlalchemy import SQLAlchemy

from rbmotd_core import utcnow

db = SQLAlchemy()


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(200), unique=True, nullable=False, index=True)
    pw_hash = db.Column(db.String(300), nullable=False)
    notify_email = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    def public(self):
        return {"id": self.id, "name": self.name, "email": self.email, "notify_email": self.notify_email}


class Daily(db.Model):
    """Today's official player and the (secret) time it drops."""
    day = db.Column(db.String(10), primary_key=True)  # YYYY-MM-DD, UK date
    player_id = db.Column(db.Integer, nullable=False)
    drop_at = db.Column(db.DateTime, nullable=False)  # UTC
    notified_at = db.Column(db.DateTime)


class Attempt(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    day = db.Column(db.String(10), nullable=False, index=True)
    started_at = db.Column(db.DateTime, nullable=False)
    finished_at = db.Column(db.DateTime)
    guesses = db.Column(db.Integer, nullable=False, default=0)
    hints = db.Column(db.Integer, nullable=False, default=0)
    solved = db.Column(db.Boolean, nullable=False, default=False)
    gave_up = db.Column(db.Boolean, nullable=False, default=False)
    points = db.Column(db.Integer, nullable=False, default=0)

    __table_args__ = (db.UniqueConstraint("user_id", "day", name="one_attempt_per_day"),)

    @property
    def finished(self):
        return self.finished_at is not None

    def seconds(self, now=None):
        end = self.finished_at or now or utcnow()
        return max(0.0, (end - self.started_at).total_seconds())
