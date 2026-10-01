#!/usr/bin/env python3
"""
Non-interactive, lockout-safe scraper run for the homeserver setup.

Downloads go through gallery-dl (gdl_runner.py), indexing through indexer.py.

Guards (see README "Homeserver"):
  - session cookie only, never a password login
  - global lock: never two runs at once
  - per-account cooldown after any block signal (401/403/429/checkpoint/...)
  - per-account minimum interval between runs
  - capped number of new posts per run, human pacing between posts
  - accounts run one after another with a long pause in between

Usage:
  scrape_run.py --account hellomynameischaos [--limit 50]
  scrape_run.py --account all
  scrape_run.py --status
  scrape_run.py --clear-cooldown rogermachtblau
"""

import argparse
import fcntl
import json
import os
import random
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import gdl_runner
import indexer
from gdl_runner import BlockSignal, is_block_signal

DATA_DIR = Path(os.environ.get("INSTA_SAVE_DATA", "/srv/insta-save"))
POSTS_DIR = DATA_DIR / "saved_posts"
SESSION_DIR = DATA_DIR / "sessions"
STATE_DIR = DATA_DIR / "state"

DEFAULT_LIMIT = 100
MAX_LIMIT = 200
COOLDOWN_HOURS = 72
MIN_INTERVAL_HOURS = 24
# @rogermachtblau is the business account that is also used by hand: scrape it rarely.
MIN_INTERVAL_OVERRIDES = {"rogermachtblau": 14 * 24}
SESSION_CHECK_URL = "https://www.instagram.com/api/v1/accounts/current_user/?edit=true"
IMPORT_COOKIES = ("sessionid", "ds_user_id", "csrftoken", "mid", "ig_did", "datr", "rur")
ACCOUNT_GAP_SECONDS = (600, 1200)

NOTIFY_PY = "/opt/vault/venv/bin/python3"
NOTIFY_DIR = "/opt/vault/Brain/04 Ressourcen/Telegram"
APP_URL = "http://192.168.178.64:3094"


def now():
    return datetime.now(timezone.utc)


def parse_ts(value):
    return datetime.fromisoformat(value) if value else None


def state_file(account):
    return STATE_DIR / f"{account}.json"


def load_state(account):
    try:
        return json.loads(state_file(account).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(account, state):
    tmp = state_file(account).with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(state_file(account))


def write_current(data):
    path = STATE_DIR / "current.json"
    if data is None:
        path.unlink(missing_ok=True)
    else:
        path.write_text(json.dumps(data))


def log_run(entry):
    with open(STATE_DIR / "runs.jsonl", "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def notify(text):
    code = (
        "import sys; sys.path.insert(0, sys.argv[1]); "
        "from telegram_notify import notify; notify(sys.argv[2])"
    )
    try:
        subprocess.run([NOTIFY_PY, "-c", code, NOTIFY_DIR, text], timeout=60, check=False)
    except Exception as e:
        print(f"Telegram notify failed: {e}")


def min_interval_hours(account):
    return MIN_INTERVAL_OVERRIDES.get(account, MIN_INTERVAL_HOURS)


def cookies_file(account):
    return SESSION_DIR / f"{account}.cookies.txt"


def known_accounts():
    return sorted(p.name.removesuffix(".cookies.txt") for p in SESSION_DIR.glob("*.cookies.txt"))


def session_meta(account):
    try:
        return json.loads((SESSION_DIR / f"{account}.meta.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def import_session(account):
    """Read cookie values as JSON from stdin and write a Netscape cookies.txt for gallery-dl (0600)."""
    if not re.fullmatch(r"[A-Za-z0-9_.]{1,30}", account or ""):
        raise SystemExit("Ungültiger Account-Name")
    data = json.load(sys.stdin)
    cookies = {k: str(data[k]).strip() for k in IMPORT_COOKIES if data.get(k)}
    if not all(cookies.get(k) for k in ("sessionid", "ds_user_id")):
        raise SystemExit("sessionid und ds_user_id sind Pflicht")
    if not cookies.get("csrftoken"):
        raise SystemExit("csrftoken fehlt — ohne ihn lehnt Instagram die Session ab. "
                         "Am einfachsten den kompletten Cookie-Header einfügen.")
    warnings = [f"{k} fehlt" for k in ("mid", "ig_did") if not cookies.get(k)]
    expires = int((now() + timedelta(days=365)).timestamp())
    cookies_txt = "# Netscape HTTP Cookie File\n" + "".join(
        f".instagram.com\tTRUE\t/\tTRUE\t{expires}\t{name}\t{value}\n" for name, value in cookies.items())
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(SESSION_DIR, 0o700)
    for name, payload in (
        (f"{account}.cookies.txt", cookies_txt.encode()),
        (f"{account}.meta.json", json.dumps({
            "user_agent": (data.get("user_agent") or "").strip() or None,
            "imported": now().isoformat(),
        }).encode()),
    ):
        path = SESSION_DIR / name
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(payload)
        os.chmod(path, 0o600)
    # A fresh session is a deliberate human action — it clears the dead-session flag, NOT a cooldown.
    st = load_state(account)
    if st.pop("session_invalid", None):
        save_state(account, st)
    print(f"Session für {account} gespeichert ({len(cookies)} Cookies)")
    if warnings:
        print("⚠️ " + ", ".join(warnings) + " — Geräte-Cookies fehlen, die Session wirkt auf Instagram unbekannt "
              "und hält erfahrungsgemäß schlechter.")


def init_account(account):
    """Create an empty data set for a new account — the deliberate human step that allows its first run."""
    if not re.fullmatch(r"[A-Za-z0-9_.]{1,30}", account or ""):
        raise SystemExit("Ungültiger Account-Name")
    account_dir = POSTS_DIR / account
    if (account_dir / "posts-index.json").exists():
        print(f"{account} ist bereits eingerichtet ({post_count(account)} Posts)")
        return
    account_dir.mkdir(parents=True, exist_ok=True)
    (account_dir / "posts-index.json").write_text("[]")
    indexer.update_accounts_list(POSTS_DIR)
    print(f"Account {account} angelegt. Nächster Schritt: Session importieren, dann ersten Lauf starten "
          f"(max. {DEFAULT_LIMIT} neueste Saves).")


def blocked_reason(account, state):
    """Return why this account must not run right now, or None."""
    if not cookies_file(account).exists():
        return "keine Session importiert"
    if not (POSTS_DIR / account / "posts-index.json").exists():
        return "kein bestehender Datenbestand (Vollabzug wäre ein Sperr-Risiko)"
    if state.get("session_invalid"):
        return f"Session ungültig seit {parse_ts(state['session_invalid']).astimezone():%d.%m. %H:%M} — neu importieren"
    cooldown = parse_ts(state.get("cooldown_until"))
    if cooldown and cooldown > now():
        return f"Cooldown bis {cooldown.astimezone():%d.%m. %H:%M} ({state.get('cooldown_reason', '')})"
    last_ok = parse_ts(state.get("last_ok"))
    hours = min_interval_hours(account)
    if last_ok and now() - last_ok < timedelta(hours=hours):
        next_ok = last_ok + timedelta(hours=hours)
        return f"letzter Lauf < {hours} h her, wieder ab {next_ok.astimezone():%d.%m. %H:%M}"
    return None


def session_alive(account):
    """One read-only request: does Instagram still accept this session? True/False, None = unclear.

    Only a clear login redirect/401 counts as dead; network errors decide nothing.
    """
    import urllib.error
    import urllib.request

    cookies = {}
    for line in cookies_file(account).read_text().splitlines():
        parts = line.split("\t")
        if len(parts) >= 7 and not line.startswith("#"):
            cookies[parts[5]] = parts[6]

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    req = urllib.request.Request(SESSION_CHECK_URL, headers={
        "User-Agent": session_meta(account).get("user_agent") or "Mozilla/5.0",
        "X-IG-App-ID": "936619743392459",
        "X-CSRFToken": cookies.get("csrftoken", ""),
        "Cookie": "; ".join(f"{k}={v}" for k, v in cookies.items()),
    })
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as r:
            return r.status == 200
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308, 401):
            return False
        return None
    except Exception:
        return None


def run_account(account, limit):
    state = load_state(account)
    reason = blocked_reason(account, state)
    if reason:
        print(f"[{account}] übersprungen: {reason}")
        return {"account": account, "status": "skipped", "reason": reason}

    if session_alive(account) is False:
        state["session_invalid"] = now().isoformat()
        state["last_run"] = now().isoformat()
        state["last_result"] = "session_invalid"
        save_state(account, state)
        reason = "Session von Instagram abgelehnt (Login-Weiterleitung) — bitte neu importieren, es wurde nichts gescraped"
        result = {"account": account, "status": "error", "reason": reason,
                  "started": now().isoformat(), "finished": now().isoformat()}
        log_run(result)
        return result

    started = now()
    write_current({"account": account, "started": started.isoformat(), "new": 0})
    output_dir = POSTS_DIR / account
    result = {"account": account, "started": started.isoformat()}
    known_ids = post_ids(account)  # for the per-category report only

    try:
        stats = gdl_runner.run(
            account,
            cookies_file=cookies_file(account),
            user_agent=session_meta(account).get("user_agent"),
            output_dir=output_dir,
            state_dir=STATE_DIR,
            limit=limit,
            on_progress=lambda n: write_current(
                {"account": account, "started": started.isoformat(), "new": n}),
        )
        result.update(status="ok", **stats)
        state["last_ok"] = now().isoformat()
        state["next_allowed"] = (now() + timedelta(hours=min_interval_hours(account))).isoformat()
    except Exception as e:
        # Second line of defence: anything that smells like a block counts as one.
        if isinstance(e, BlockSignal) or is_block_signal(e):
            until = now() + timedelta(hours=COOLDOWN_HOURS)
            state["cooldown_until"] = until.isoformat()
            state["cooldown_reason"] = str(e)[:200]
            result.update(status="blocked", reason=str(e)[:500])
        else:
            result.update(status="error", reason=f"{type(e).__name__}: {e}"[:500])
    finally:
        # Index whatever was downloaded, even on abort.
        try:
            indexer.convert_gallery_dl(output_dir)
            indexer.build_index(output_dir)
            indexer.update_accounts_list(POSTS_DIR)
        except Exception as e:
            result.setdefault("reason", f"Index-Fehler: {e}"[:300])
        if result.get("new"):
            try:
                # Jev is fail-open: unreachable -> posts stay uncategorised for the next run.
                import categorize
                cat = categorize.categorize(account)
                result["categorized"] = cat["assigned"]
            except Exception as e:
                print(f"Kategorisierung übersprungen: {e}")
        try:
            result.update(category_summary(account, post_ids(account) - known_ids))
        except Exception as e:
            print(f"Kategorie-Übersicht übersprungen: {e}")
        state["last_run"] = now().isoformat()
        state["last_result"] = result.get("status")
        save_state(account, state)
        result["finished"] = now().isoformat()
        log_run(result)
        write_current(None)

    return result


def post_ids(account):
    try:
        with open(POSTS_DIR / account / "posts-index.json", encoding="utf-8") as f:
            return {p["id"] for p in json.load(f) if p.get("id")}
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def category_summary(account, new_ids):
    """New posts per category (after categorize) + open Jev suggestions for the report.

    Open suggestion = autoCategory set but categories still empty (see categorize.py:
    confidence below min_confidence) — they wait in the app's "Vorschläge" view.
    """
    try:
        with open(POSTS_DIR / account / "metadata.json", encoding="utf-8") as f:
            posts = json.load(f).get("posts", {})
    except (FileNotFoundError, json.JSONDecodeError):
        posts = {}
    by_cat = {}
    for pid in new_ids:
        cats = (posts.get(pid) or {}).get("categories") or ["ohne Kategorie"]
        for c in cats:
            by_cat[c] = by_cat.get(c, 0) + 1
    open_suggestions = sum(1 for e in posts.values()
                           if e.get("autoCategory") and not e.get("categories"))
    return {"new_by_category": dict(sorted(by_cat.items(), key=lambda kv: (-kv[1], kv[0]))),
            "open_suggestions": open_suggestions}


def format_report(results):
    lines = ["📥 insta-save Lauf"]
    for r in results:
        acc = r["account"]
        if r["status"] == "ok":
            failed = f", {r['failed_files']} Datei(en) fehlgeschlagen" if r.get("failed_files") else ""
            cat = f", {r['categorized']} per Jev kategorisiert" if r.get("categorized") else ""
            lines.append(f"✅ {acc}: {r.get('new', 0)} neue Posts{cat}{failed}")
            if r.get("new_by_category"):
                lines.append("   " + " · ".join(f"{c} {n}" for c, n in r["new_by_category"].items()))
        elif r["status"] == "blocked":
            lines.append(f"⛔ {acc}: ABGEBROCHEN – Warnsignal von Instagram, {COOLDOWN_HOURS} h Cooldown")
            lines.append(f"   {r.get('reason', '')[:150]}")
        elif r["status"] == "skipped":
            lines.append(f"⏭ {acc}: {r['reason']}")
        else:
            lines.append(f"❌ {acc}: {r.get('reason', '')[:150]}")
        if r["status"] != "skipped" and r.get("open_suggestions"):
            lines.append(f"   💡 {r['open_suggestions']} Kategorie-Vorschläge offen → {APP_URL}/#vorschlaege")
    return "\n".join(lines)


def status():
    out = {"running": is_locked(), "current": None, "accounts": {}}
    try:
        out["current"] = json.loads((STATE_DIR / "current.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    for acc in sorted(set(known_accounts()) | {p.name for p in POSTS_DIR.iterdir() if p.is_dir()}):
        st = load_state(acc)
        out["accounts"][acc] = {
            "posts": post_count(acc),
            "has_session": cookies_file(acc).exists(),
            "blocked_reason": blocked_reason(acc, st),
            **st,
        }
    out["recent_runs"] = recent_runs(10)
    print(json.dumps(out, indent=2, ensure_ascii=False))


def post_count(account):
    try:
        with open(POSTS_DIR / account / "posts-index.json", encoding="utf-8") as f:
            return len(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def recent_runs(limit):
    try:
        with open(STATE_DIR / "runs.jsonl", encoding="utf-8") as f:
            lines = f.readlines()[-limit:]
    except FileNotFoundError:
        return []
    return [json.loads(line) for line in reversed(lines) if line.strip()]


def is_locked():
    with open(STATE_DIR / "scrape.lock", "a") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(f, fcntl.LOCK_UN)
            return False
        except BlockingIOError:
            return True


def main():
    parser = argparse.ArgumentParser(description="insta-save: sicherer, manueller Scraper-Lauf")
    parser.add_argument("--account", action="append", help="Account oder 'all' (mehrfach möglich)")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help=f"max. neue Posts je Account (≤ {MAX_LIMIT})")
    parser.add_argument("--status", action="store_true", help="Status als JSON ausgeben")
    parser.add_argument("--clear-cooldown", metavar="ACCOUNT", help="Cooldown bewusst aufheben")
    parser.add_argument("--import-session", metavar="ACCOUNT", help="Cookies als JSON von stdin importieren")
    parser.add_argument("--init-account", metavar="ACCOUNT", help="neuen Account anlegen (erlaubt den ersten Lauf)")
    parser.add_argument("--no-notify", action="store_true", help="keine Telegram-Meldung")
    args = parser.parse_args()

    STATE_DIR.mkdir(parents=True, exist_ok=True)

    if args.status:
        status()
        return 0

    if args.import_session:
        import_session(args.import_session)
        return 0

    if args.init_account:
        init_account(args.init_account)
        return 0

    if args.clear_cooldown:
        st = load_state(args.clear_cooldown)
        st.pop("cooldown_until", None)
        st.pop("cooldown_reason", None)
        save_state(args.clear_cooldown, st)
        print(f"Cooldown für {args.clear_cooldown} aufgehoben")
        return 0

    if not args.account:
        parser.error("--account fehlt")
    accounts = known_accounts() if "all" in args.account else args.account
    limit = max(1, min(args.limit, MAX_LIMIT))

    lock = open(STATE_DIR / "scrape.lock", "a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("Es läuft bereits ein Scraper-Lauf — abgebrochen.")
        return 3

    # Read by server.js (status without spawning Python): pid proves the run is alive.
    running_file = STATE_DIR / "running.json"
    running_file.write_text(json.dumps({"pid": os.getpid(), "started": now().isoformat(), "accounts": accounts}))
    try:
        results = run_accounts(accounts, limit)
    finally:
        running_file.unlink(missing_ok=True)

    report = format_report(results)
    print(report)
    if not args.no_notify:
        notify(report)
    return 1 if any(r["status"] in ("blocked", "error") for r in results) else 0


def run_accounts(accounts, limit):
    results = []
    for i, account in enumerate(accounts):
        if i and results[-1]["status"] != "skipped":
            gap = random.uniform(*ACCOUNT_GAP_SECONDS)
            print(f"Pause {gap / 60:.0f} min vor {account} …")
            time.sleep(gap)
        result = run_account(account, limit)
        results.append(result)
        if result["status"] == "blocked":
            # Same IP for all accounts — stop everything after any warning.
            for rest in accounts[i + 1:]:
                results.append({"account": rest, "status": "skipped", "reason": "Lauf nach Warnsignal gestoppt"})
            break
    return results


if __name__ == "__main__":
    sys.exit(main())
