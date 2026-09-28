#!/opt/vault/venv/bin/python3
"""
Weekly reminder for insta-save (Vault Cron, Sundays).

Per account: last successful run (runs.jsonl + state), active cooldown, session
present/age, running run. Guards come from scrape_run.py (blocked_reason etc.) —
this script never starts a run and NEVER lifts a cooldown; it only asks Roger.

  due (last ok > 7 days, nothing blocks)       → buttons "📥 @acc jetzt laden" (instasave:run:<acc>) + "Später"
  cooldown / no session / last run auth error  → info with the session import how-to
  service down / < 10 GiB free on data disk       → warning
Everything goes into at most ONE Telegram message to Roger; nothing to say → no message.

Usage: remind.py [--dry-run]
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import timedelta

import scrape_run as sr

ROGER = 419207556
DUE_DAYS = 7
MIN_FREE_BYTES = 10 * 2**30
SERVICE = "insta-save.service"
BRAIN_UI = "http://192.168.178.64:3090/insta-save"
TELEGRAM_DIR = "/opt/vault/Brain/04 Ressourcen/Telegram"
AUTH_RE = re.compile(r"\b401\b|login|checkpoint|challenge|unauthori[sz]ed|session|cookie|csrf|auth",
                     re.IGNORECASE)
SESSION_HOWTO = (
    "So geht's: instagram.com im Browser (eingeloggt) → Entwicklertools → Cookies → "
    f"sessionid, ds_user_id, csrftoken kopieren → in Brain UI {BRAIN_UI} importieren. "
    "Ein Cooldown läuft trotzdem von selbst ab – er wird nie automatisch aufgehoben."
)


def runs_by_account():
    """(last run, last ok run) per account — runs.jsonl streamed line by line."""
    last, last_ok = {}, {}
    try:
        with open(sr.STATE_DIR / "runs.jsonl", encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                acc = r.get("account")
                if not acc or r.get("status") == "skipped":
                    continue
                last[acc] = r
                if r.get("status") == "ok":
                    last_ok[acc] = r
    except FileNotFoundError:
        pass
    return last, last_ok


def is_running():
    try:
        pid = json.loads((sr.STATE_DIR / "running.json").read_text()).get("pid")
        if pid:
            import os
            os.kill(int(pid), 0)
            return True
    except (FileNotFoundError, json.JSONDecodeError, ProcessLookupError, ValueError, TypeError):
        pass
    except PermissionError:
        return True
    return sr.is_locked()


def accounts():
    with_data = {p.name for p in sr.POSTS_DIR.iterdir()
                 if p.is_dir() and (p / "posts-index.json").exists()} if sr.POSTS_DIR.exists() else set()
    return sorted(set(sr.known_accounts()) | with_data)


def days_since(ts):
    return (sr.now() - ts).total_seconds() / 86400 if ts else None


def check_account(acc, last, last_ok, running):
    state = sr.load_state(acc)
    ok_ts = [t for t in (sr.parse_ts(state.get("last_ok")),
                         sr.parse_ts((last_ok.get(acc) or {}).get("finished"))) if t]
    last_ok_ts = max(ok_ts) if ok_ts else None
    cooldown = sr.parse_ts(state.get("cooldown_until"))
    has_session = sr.cookies_file(acc).exists()
    imported = sr.parse_ts(sr.session_meta(acc).get("imported"))
    last_run = last.get(acc) or {}
    auth_error = (last_run.get("status") in ("blocked", "error")
                  and bool(AUTH_RE.search(last_run.get("reason") or "")))
    info = {
        "account": acc,
        "last_ok": last_ok_ts.isoformat() if last_ok_ts else None,
        "days_since_ok": round(days_since(last_ok_ts), 1) if last_ok_ts else None,
        "cooldown_until": cooldown.isoformat() if cooldown and cooldown > sr.now() else None,
        "has_session": has_session,
        "session_age_days": round(days_since(imported), 1) if imported else None,
        "last_run_auth_error": auth_error,
        "blocked_reason": sr.blocked_reason(acc, state),
        "running": running,
    }
    if info["cooldown_until"]:
        info["decision"] = "cooldown"
    elif not has_session or auth_error:
        info["decision"] = "session"
    elif running or info["blocked_reason"]:
        info["decision"] = "blocked"
    elif last_ok_ts is None or sr.now() - last_ok_ts > timedelta(days=DUE_DAYS):
        info["decision"] = "due"
    else:
        info["decision"] = "ok"
    return info


def health():
    problems = []
    try:
        active = subprocess.run(["systemctl", "is-active", SERVICE], capture_output=True,
                                text=True, timeout=10).stdout.strip()
    except Exception as e:
        active = f"unbekannt ({e})"
    if active != "active":
        problems.append(f"⚠️ {SERVICE} ist nicht aktiv ({active or '?'})")
    free = shutil.disk_usage(sr.DATA_DIR).free  # Datenplatte (sdb), nicht /srv = Container-Rootfs
    if free < MIN_FREE_BYTES:
        problems.append(f"⚠️ Nur noch {free / 2**30:.1f} GiB frei auf der Datenplatte {sr.DATA_DIR} (Warnschwelle 10 GiB)")
    return problems


def build_message(infos, problems):
    """(text, button_rows) or (None, None) when there is nothing to say."""
    lines, rows = [], []
    due = [i for i in infos if i["decision"] == "due"]
    if due:
        lines.append("📥 insta-save: Zeit für neue gespeicherte Posts")
        for i in due:
            since = (f"letzter Lauf vor {i['days_since_ok']:.0f} Tagen" if i["days_since_ok"] is not None
                     else "noch kein erfolgreicher Lauf")
            age = f", Session {i['session_age_days']:.0f} Tage alt" if i["session_age_days"] is not None else ""
            lines.append(f"• @{i['account']}: {since}{age}")
            rows.append([(f"📥 @{i['account']} jetzt laden", f"instasave:run:{i['account']}")])
        rows.append([("Später", "instasave:skip")])
    blocked = [i for i in infos if i["decision"] in ("cooldown", "session")]
    if blocked:
        if lines:
            lines.append("")
        lines.append("ℹ️ insta-save: Account(s) brauchen dich")
        for i in blocked:
            if i["decision"] == "cooldown":
                lines.append(f"• @{i['account']}: {i['blocked_reason'] or 'Cooldown bis ' + i['cooldown_until']}")
            elif not i["has_session"]:
                lines.append(f"• @{i['account']}: keine Session importiert")
            else:
                lines.append(f"• @{i['account']}: letzter Lauf endete mit Login-/Session-Fehler")
        lines.append(SESSION_HOWTO)
    if problems:
        if lines:
            lines.append("")
        lines.extend(problems)
    if not lines:
        return None, None
    return "\n".join(lines), rows or None


def send(text, rows):
    sys.path.insert(0, TELEGRAM_DIR)
    import telegram_notify
    if rows:
        return telegram_notify.notify_button_rows(ROGER, text, rows)
    return telegram_notify.notify_chat(ROGER, text)


def main():
    parser = argparse.ArgumentParser(description="insta-save: wöchentliche Erinnerung + Health")
    parser.add_argument("--dry-run", action="store_true", help="Entscheidung ausgeben statt senden")
    args = parser.parse_args()

    last, last_ok = runs_by_account()
    running = is_running()
    infos = [check_account(acc, last, last_ok, running) for acc in accounts()]
    problems = health()
    text, rows = build_message(infos, problems)

    if args.dry_run:
        print(json.dumps({"accounts": infos, "health": problems}, indent=2, ensure_ascii=False))
        print("\n--- Nachricht ---\n" + (text or "(keine — nichts zu melden)"))
        if rows:
            print("Buttons:", json.dumps(rows, ensure_ascii=False))
        return 0
    if not text:
        print("Nichts zu melden.")
        return 0
    ok = send(text, rows)
    print(("Gesendet:\n" if ok else "Senden fehlgeschlagen:\n") + text)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
