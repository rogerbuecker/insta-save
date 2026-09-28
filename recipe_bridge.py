#!/opt/vault/venv/bin/python3
"""
Turn a saved Instagram post into a Vault recipe (headless Claude, synchronous).

Reuses the Telegram recipe flow's prompt (vaultbot.flows.recipe.build_digitize_prompt)
in "unknown title" mode: Claude derives the title, writes the recipe to
03 Bereiche/Haushalt/Rezepte/, links it in the overview, answers the given chat via
notify_chat and writes the final path (or KEIN_REZEPT) to <work_dir>/result_path.txt.
On success the post's metadata gets {"recipe": {"path", "requestedAt"}} via the app API.

Must run with /opt/vault/venv (python-telegram-bot for vaultbot/telegram_notify).

Usage:
  recipe_bridge.py --account hellomynameischaos --post 2020-06-03_15-47-22_UTC --chat 419207556
  recipe_bridge.py ... --dry-run      # build work dir + prompt, print it, no Claude call

Exit: 0 = recipe created or post is no recipe (last stdout line is a JSON status),
      1 = error (the chat got a short error message), 2 = bad arguments.
"""

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

TELEGRAM_DIR = "/opt/vault/Brain/04 Ressourcen/Telegram"
sys.path.insert(0, TELEGRAM_DIR)
from vaultbot.flows.recipe import _slugify, build_digitize_prompt  # noqa: E402

DATA_DIR = Path(os.environ.get("INSTA_SAVE_DATA", "/srv/insta-save"))
POSTS_DIR = DATA_DIR / "saved_posts"
VAULT = Path("/opt/vault/Brain")
RECIPE_ROOT = VAULT / "03 Bereiche" / "Haushalt" / "Rezepte"
QUELLEN_ROOT = RECIPE_ROOT / "_Quellen"
INDEX_FILE = RECIPE_ROOT / "Rezepte Übersicht.md"
CLAUDE_TASK = "/opt/vault/bin/claude-task.sh"
API = "http://127.0.0.1:3094"
TIMEOUT_S = 15 * 60
MAX_IMAGES = 5
NO_RECIPE = "KEIN_REZEPT"

ACCOUNT_RE = re.compile(r"^[A-Za-z0-9_.]{1,30}$")  # same as server.js ACCOUNT_RE
POST_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,80}$")


class BridgeError(Exception):
    pass


def notify_chat(chat_id, text):
    try:
        from telegram_notify import notify_chat as _notify
        _notify(chat_id, text)
    except Exception as e:
        print(f"Telegram-Meldung fehlgeschlagen: {e}", file=sys.stderr)


def load_post(account, post_id):
    index_file = POSTS_DIR / account / "posts-index.json"
    try:
        with open(index_file, encoding="utf-8") as f:
            posts = json.load(f)
    except FileNotFoundError:
        raise BridgeError(f"Kein Datenbestand für @{account}")
    for post in posts:
        if post.get("id") == post_id:
            return post
    raise BridgeError(f"Post {post_id} nicht gefunden")


def media_files(account, post):
    """Up to MAX_IMAGES existing JPGs: carousel images first, then video posters."""
    base = (POSTS_DIR / account).resolve()
    items = post.get("carouselItems") or [post]
    names = [i.get("displayUrl") for i in items if not i.get("isVideo")]
    names += [i.get("displayUrl") for i in items if i.get("isVideo")]
    out = []
    for name in names:
        if not name:
            continue
        path = (base / name).resolve()
        if path.parent != base or path.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
            continue  # never leave the account dir
        if path.is_file() and path not in out:
            out.append(path)
        if len(out) >= MAX_IMAGES:
            break
    return out


def build_work_dir(account, post):
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    work = QUELLEN_ROOT / f"{ts}_insta-{_slugify(post.get('owner') or account)}"
    work.mkdir(parents=True, exist_ok=True)
    caption = (post.get("caption") or "").strip() or "(keine Bildunterschrift)"
    (work / "insta_text_1.md").write_text(caption + "\n", encoding="utf-8")
    if post.get("postUrl"):
        (work / "insta_link_1.txt").write_text(post["postUrl"].strip() + "\n", encoding="utf-8")
    for n, src in enumerate(media_files(account, post), 1):
        shutil.copyfile(src, work / f"insta_{n}{src.suffix.lower()}")
    return work


def run_claude(prompt):
    """claude-task.sh like vaultbot's trigger_task, but blocking with a hard timeout."""
    proc = subprocess.Popen([CLAUDE_TASK, prompt], stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        return proc.wait(timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGTERM)  # claude runs as a grandchild — kill the whole group
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
        raise BridgeError(f"Claude hat nach {TIMEOUT_S // 60} Min nicht fertig")


def read_result(work):
    try:
        raw = (work / "result_path.txt").read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        raise BridgeError("Claude hat kein Ergebnis hinterlegt")
    if raw == NO_RECIPE:
        return None
    path = Path(raw.splitlines()[0].strip())
    if not path.is_absolute():
        path = VAULT / path
    path = path.resolve()
    if path.parent != RECIPE_ROOT.resolve() or path.suffix != ".md" or not path.is_file():
        raise BridgeError(f"Ergebnis-Pfad ungültig: {raw[:120]}")
    return path


def save_metadata(account, post_id, rel_path, requested_at):
    """Partial merge via the app (A1's PUT); tolerate an older server that ignores it."""
    url = (f"{API}/api/posts/{urllib.parse.quote(post_id)}/metadata?"
           + urllib.parse.urlencode({"account": account}))
    body = json.dumps({"recipe": {"path": rel_path, "requestedAt": requested_at}}).encode()
    req = urllib.request.Request(url, data=body, method="PUT",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except (urllib.error.URLError, OSError) as e:
        print(f"Metadata-PUT fehlgeschlagen (Rezept ist trotzdem angelegt): {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="insta-save: Post → Vault-Rezept (headless Claude)")
    parser.add_argument("--account", required=True)
    parser.add_argument("--post", required=True)
    parser.add_argument("--chat", required=True, type=int, help="Telegram chat_id für die Rückmeldung")
    parser.add_argument("--dry-run", action="store_true", help="nur Work-Dir + Prompt, kein Claude")
    args = parser.parse_args()
    if not ACCOUNT_RE.match(args.account) or not POST_RE.match(args.post):
        print("Ungültiger Account oder Post-ID", file=sys.stderr)
        return 2

    requested_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        post = load_post(args.account, args.post)
        work = build_work_dir(args.account, post)
        owner = post.get("owner")
        quelle = " – ".join(x for x in (post.get("postUrl"), f"@{owner}" if owner else None) if x)
        prompt = build_digitize_prompt(
            args.chat, None, work, None, RECIPE_ROOT, INDEX_FILE,
            quelle=quelle or "Instagram", result_file=work / "result_path.txt")
        if args.dry_run:
            print(f"Work-Dir: {work}")
            for p in sorted(work.iterdir()):
                print(f"  {p.name} ({p.stat().st_size} B)")
            print("\n--- Prompt ---\n" + prompt)
            print(json.dumps({"status": "dry_run", "work_dir": str(work)}))
            return 0

        rc = run_claude(prompt)
        try:
            path = read_result(work)
        except BridgeError as e:
            raise BridgeError(f"{e} (claude-task.sh exit {rc})") if rc else e
        if path is None:
            print(json.dumps({"status": "no_recipe"}))
            return 0
        rel = str(path.relative_to(VAULT))
        saved = save_metadata(args.account, args.post, rel, requested_at)
        print(json.dumps({"status": "ok", "path": rel, "metadata_saved": saved}, ensure_ascii=False))
        return 0
    except Exception as e:
        msg = str(e) if isinstance(e, BridgeError) else f"{type(e).__name__}: {e}"
        print(f"Fehler: {msg}", file=sys.stderr)
        if not args.dry_run:
            notify_chat(args.chat, f"⚠️ Rezept aus Instagram-Post konnte nicht erstellt werden: {msg[:300]}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
