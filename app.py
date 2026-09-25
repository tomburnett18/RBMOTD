"""RBMOTD – football games for the pub.

Phase 1: the app shell and all solo / pass-the-phone games run in the browser.
Phase 2 adds accounts, the daily RBMOTD, leaderboard and notifications here.
"""
from flask import Flask, render_template, send_from_directory, jsonify

APP_VERSION = "1.2.0"

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html", version=APP_VERSION)


@app.route("/sw.js")
def service_worker():
    # Served from the root so it can control the whole app.
    resp = send_from_directory(app.static_folder, "sw.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


@app.route("/manifest.webmanifest")
def manifest():
    return send_from_directory(app.static_folder, "manifest.webmanifest",
                               mimetype="application/manifest+json")


@app.route("/api/health")
def health():
    return jsonify(ok=True, version=APP_VERSION)


if __name__ == "__main__":
    app.run(debug=True)
