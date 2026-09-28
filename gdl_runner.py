"""
gallery-dl based downloader for saved posts, run as a subprocess with a generated,
isolated config (--config-ignore: no user config, no netrc, never a password).

Why gallery-dl: it reads saved posts through the same REST endpoint the Instagram
web app uses (/api/v1/feed/saved/posts/, 50 posts per request) with web-app headers,
so there are no per-post metadata queries and no legacy GraphQL query hashes.

Lockout guards applied here (the rest lives in scrape_run.py):
  - retries=0 and sleep-429=0: the first 429/401/403 ends the run instead of retrying
  - 8–15 s between API requests, 3–8 s between file downloads
  - user agent + browser header profile of the browser the cookie came from
  - max-posts caps the run, skip="abort:30" stops once we reach known posts
  - Instagram-side warnings (401/403/429, checkpoint/challenge, login redirect,
    feedback_required) raise BlockSignal; CDN failures only count as failed files
"""

import json
import re
import subprocess
import time
from pathlib import Path

from indexer import GDL_DIR

GALLERY_DL = str(Path(__file__).parent / "venv" / "bin" / "gallery-dl")
RUN_TIMEOUT = 3 * 3600

BLOCK_PATTERN = re.compile(
    r"\b(401|403|429)\b|checkpoint|challenge|please wait|login|feedback_required|"
    r"rate.?limit|unauthori[sz]ed|forbidden",
    re.IGNORECASE,
)
LOG_LINE = re.compile(r"^\[(?P<name>[\w.\-]+)\]\[(?P<level>error|warning)\]\s*(?P<msg>.*)$")
POST_STEM = re.compile(r"^(?P<post>\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_UTC)(?:_\d+)?$")

# gallery-dl exit status bits (gallery_dl/exception.py)
EXIT_CHALLENGE = 8
EXIT_AUTH = 16


class BlockSignal(Exception):
    """Instagram returned something that looks like a rate limit, checkpoint or dead session."""


def is_block_signal(exc):
    return isinstance(exc, BlockSignal) or bool(BLOCK_PATTERN.search(str(exc)))


def build_config(output_dir, cookies_file, user_agent, limit, cache_file):
    browser = "firefox" if user_agent and "Firefox/" in user_agent else "chrome"
    # post_date, not date: gallery-dl sets "date" per carousel item (can differ by a second),
    # while instaloader named every file after the post — post_date keeps names identical.
    ts = "{post_date:%Y-%m-%d_%H-%M-%S}_UTC"
    extractor = {
        "base-directory": str(output_dir),
        "cookies": str(cookies_file),
        "cookies-update": True,
        "browser": browser,
        "retries": 0,
        "sleep-429": 0,
        "sleep-request": [8.0, 15.0],
        "sleep": [3.0, 8.0],
        "skip": "abort:30",
        "instagram": {
            "directory": [],
            "api": "rest",
            "videos": "merged",
            "previews": "video",
            "max-posts": limit,
            "warn-images": False,
            "warn-videos": False,
        },
        # Same names as the legacy instaloader downloads, so known posts are skipped.
        # Carousel = sidecar_media_id (count is 2 for single reels: video + unused audio track).
        "filename": {
            "sidecar_media_id": ts + "_{num}.{extension}",
            "": ts + ".{extension}",
        },
        "postprocessors": [{
            "name": "metadata",
            "event": "post",
            "directory": GDL_DIR,
            "filename": ts + ".json",
            "skip": True,
        }],
    }
    if user_agent:
        extractor["user-agent"] = user_agent
    return {
        "extractor": extractor,
        "downloader": {"retries": 1, "part": True},
        "cache": {"file": str(cache_file)},
        "output": {"mode": "pipe", "progress": False, "log": "[{name}][{levelname}] {message}"},
    }


def classify(returncode, log_lines, stopped_by_us=False):
    """Return (blocked_reason | None, error_reason | None, failed_files)."""
    failed_files = 0
    blocked = None
    error = None
    for line in log_lines:
        m = LOG_LINE.match(line)
        if not m:
            continue
        name, msg = m["name"], m["msg"]
        if name.startswith("instagram"):
            if BLOCK_PATTERN.search(msg):
                blocked = blocked or msg
            elif m["level"] == "error":
                error = error or msg
        elif name.startswith("download") and m["level"] == "error":
            failed_files += 1
    if returncode < 0:
        # Killed by a signal — our own limit/timeout stop, not an exit status from gallery-dl.
        if not stopped_by_us and not blocked:
            error = error or f"gallery-dl durch Signal {-returncode} beendet"
        return blocked, error, failed_files
    if returncode & (EXIT_CHALLENGE | EXIT_AUTH) and not blocked:
        blocked = f"gallery-dl exit {returncode} (challenge/auth)"
    if returncode and not blocked and not error and not failed_files:
        error = f"gallery-dl exit {returncode}"
    return blocked, error, failed_files


def run(account, cookies_file, user_agent, output_dir, state_dir, limit, on_progress=None):
    """Download new saved posts for one account. Returns stats, raises BlockSignal."""
    output_dir = Path(output_dir)
    state_dir = Path(state_dir)
    config_file = state_dir / f"gdl-{account}.conf.json"
    config_file.write_text(json.dumps(
        build_config(output_dir, cookies_file, user_agent, limit, state_dir / "gdl-cache.sqlite3"),
        indent=2))
    config_file.chmod(0o600)

    log_file = state_dir / f"gdl-{account}.last.log"
    url = f"https://www.instagram.com/{account}/saved/"
    new_posts, skipped_files, log_lines = set(), 0, []
    stopped_by_us = False

    with open(log_file, "w", buffering=1) as err_out:  # line-buffered: follow a live run
        proc = subprocess.Popen(
            [GALLERY_DL, "--config-ignore", "-c", str(config_file), url],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
        )
        started = time.monotonic()
        for line in proc.stdout:
            line = line.rstrip("\n")
            err_out.write(line + "\n")
            if LOG_LINE.match(line):
                log_lines.append(line)
                continue
            if line.startswith("# "):
                skipped_files += 1
                continue
            m = POST_STEM.match(Path(line).stem)
            if m and m["post"] not in new_posts:
                new_posts.add(m["post"])
                if on_progress:
                    on_progress(len(new_posts))
                if len(new_posts) > limit and not stopped_by_us:  # max-posts should prevent this
                    stopped_by_us = True
                    proc.terminate()
            if time.monotonic() - started > RUN_TIMEOUT and not stopped_by_us:
                stopped_by_us = True
                proc.terminate()
                log_lines.append("[insta-save][error] run timeout")
        returncode = proc.wait()

    blocked, error, failed_files = classify(returncode, log_lines, stopped_by_us)
    if blocked:
        raise BlockSignal(blocked)
    if error:
        raise RuntimeError(error)
    return {"new": len(new_posts), "skipped_files": skipped_files, "failed_files": failed_files}
