"""Sending notification emails over SMTP. Settings come from the .env file (see .env.example)."""
import json
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

log = logging.getLogger("rbmotd.notify")


def env(key, default=""):
    return os.environ.get(key, default).strip()


# ---------------- Email ----------------
def email_configured():
    return bool(env("SMTP_HOST") and (env("MAIL_FROM") or env("SMTP_USER")))


def send_email(recipients, subject, text, html=None):
    """Send one email per recipient over a single SMTP connection.
    Returns (sent, failed). Does nothing if SMTP isn't configured."""
    recipients = [r for r in recipients if r]
    if not recipients:
        return 0, 0
    if not email_configured():
        log.warning("SMTP not configured; skipped %d email(s)", len(recipients))
        return 0, len(recipients)

    host, port = env("SMTP_HOST"), int(env("SMTP_PORT", "587"))
    sender = env("MAIL_FROM") or env("SMTP_USER")
    sender_name = env("MAIL_FROM_NAME", "RBMOTD")
    sent = failed = 0
    ctx = ssl.create_default_context()
    use_tls = env("SMTP_TLS", "1") != "0"
    smtp = smtplib.SMTP_SSL(host, port, timeout=30, context=ctx) if port == 465 else smtplib.SMTP(host, port, timeout=30)
    try:
        if port != 465 and use_tls:
            smtp.starttls(context=ctx)
        if env("SMTP_USER") and env("SMTP_PASSWORD"):
            smtp.login(env("SMTP_USER"), env("SMTP_PASSWORD"))
        for to in recipients:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = formataddr((sender_name, sender))
            msg["To"] = to
            msg.set_content(text)
            if html:
                msg.add_alternative(html, subtype="html")
            try:
                smtp.send_message(msg)
                sent += 1
            except smtplib.SMTPException as e:
                failed += 1
                log.error("Email to %s failed: %s", to, e)
    finally:
        try:
            smtp.quit()
        except Exception:
            pass
    return sent, failed


def email_html(heading, body, button_text, url):
    """A small, plain email layout that matches the app's colours."""
    return f"""<!doctype html><html><body style="margin:0;background:#0E4A36;font-family:Arial,Helvetica,sans-serif;color:#F4F7F1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:40px;font-weight:900;letter-spacing:-1px;padding-bottom:18px">RBMOTD<span style="color:#F5B82E">.</span></td></tr>
<tr><td style="font-size:24px;font-weight:700;padding-bottom:10px">{heading}</td></tr>
<tr><td style="font-size:16px;line-height:1.5;color:#D6E0D9;padding-bottom:24px">{body}</td></tr>
<tr><td><a href="{url}" style="display:inline-block;background:#F5B82E;color:#2B1E00;font-weight:700;text-decoration:none;padding:14px 24px;border-radius:999px">{button_text}</a></td></tr>
<tr><td style="font-size:12px;color:#9DB5A8;padding-top:28px">You can turn these emails off in your account on RBMOTD.</td></tr>
</table></td></tr></table></body></html>"""
