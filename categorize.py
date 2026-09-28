#!/usr/bin/env python3
"""
Assign categories to saved posts with Jev (TypeSafe decision model via OpenRouter).

One Jev "choice" call per post (caption, hashtags, owner, location, media type) over the
categories in <data>/categories.json. Confident answers (>= min_confidence) are written
as the post's category; less confident ones are only stored as a suggestion
(metadata.posts[id].autoCategory) and show up in the app's "Categorize" flow.

Fail-open: if Jev is unreachable a post is simply left for the next run.
Posts that already have categories (set by hand) are never touched.

Usage:
  categorize.py --account hellomynameischaos [--limit 20] [--dry-run]
  categorize.py --account all [--redo]      # --redo: re-evaluate automatic assignments too
"""

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "/opt/vault/Brain/04 Ressourcen/Jev")
import jev_client  # noqa: E402

DATA_DIR = Path(os.environ.get("INSTA_SAVE_DATA", "/srv/insta-save"))
POSTS_DIR = DATA_DIR / "saved_posts"
CATEGORIES_FILE = DATA_DIR / "categories.json"
CAPTION_CHARS = 1200
WORKERS = 2  # Jev (early access) times out under more parallel load (28.09.: 77 timeouts at 4)
CHECKPOINT_EVERY = 100


def load_config():
    cfg = json.loads(CATEGORIES_FILE.read_text(encoding="utf-8"))
    return cfg["categories"], float(cfg.get("min_confidence", 0.75))


def read_metadata(account):
    try:
        return json.loads((POSTS_DIR / account / "metadata.json").read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"posts": {}, "categories": []}


def merge_metadata(account, results, categories):
    """Re-read metadata.json (the app may have written meanwhile) and apply results atomically."""
    meta = read_metadata(account)
    meta.setdefault("posts", {})
    meta["categories"] = sorted(set(meta.get("categories", [])) | set(categories))
    applied = 0
    for post_id, auto in results.items():
        entry = meta["posts"].setdefault(post_id, {"categories": [], "notes": ""})
        manual = entry.get("categories") and not entry.get("autoCategory", {}).get("assigned")
        if manual:
            continue  # Roger (or Nadine) categorised it by hand in the meantime
        entry["autoCategory"] = auto
        entry["categories"] = [auto["category"]] if auto["assigned"] else []
        applied += 1
    path = POSTS_DIR / account / "metadata.json"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    return applied


def post_state(post):
    kind = "Karussell" if post.get("isCarousel") else ("Video/Reel" if post.get("isVideo") else "Bild")
    return {
        "bildunterschrift": (post.get("caption") or "")[:CAPTION_CHARS],
        "hashtags": post.get("hashtags", [])[:30],
        "urheber_account": post.get("owner"),
        "ort": post.get("location"),
        "medientyp": kind,
    }


def classify(post, categories, min_conf):
    question = {
        "kategorie": {
            "type": "choice",
            "instructions": ("Ein gespeicherter Instagram-Post (Bildunterschrift, Hashtags, Urheber-Account). "
                             "Welches Thema hat der Post hauptsächlich?"),
            "criteria": categories,
        }
    }
    answers = jev_client.decide(post_state(post), question, caller="insta_save_categorize", timeout=40)
    if not answers:
        return None
    answer = answers.get("kategorie") or {}
    choice = answer.get("choice")
    if choice not in categories:
        return None
    conf = jev_client.confidence_of(answer) or 0.0
    return {
        "category": choice,
        "confidence": round(conf, 3),
        "assigned": conf >= min_conf,
        "model": jev_client.MODEL,
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def pending_posts(account, redo):
    index = json.loads((POSTS_DIR / account / "posts-index.json").read_text(encoding="utf-8"))
    meta = read_metadata(account).get("posts", {})
    todo = []
    for post in index:
        entry = meta.get(post["id"], {})
        auto = entry.get("autoCategory")
        if entry.get("categories") and not (auto and auto.get("assigned")):
            continue  # manual categories are never overwritten
        if auto and not redo:
            continue
        todo.append(post)
    return todo


def categorize(account, limit=None, redo=False, dry_run=False):
    categories, min_conf = load_config()
    todo = pending_posts(account, redo)
    if limit:
        todo = todo[:limit]
    print(f"[{account}] {len(todo)} Posts zu kategorisieren")

    stats = {"account": account, "checked": len(todo), "assigned": 0, "suggested": 0, "failed": 0}
    results = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for i, (post, auto) in enumerate(zip(todo, pool.map(lambda p: classify(p, categories, min_conf), todo)), 1):
            if auto is None:
                stats["failed"] += 1
            else:
                results[post["id"]] = auto
                stats["assigned" if auto["assigned"] else "suggested"] += 1
                if dry_run:
                    print(f"  {auto['confidence']:.2f} {'✓' if auto['assigned'] else '?'} "
                          f"{auto['category']:<22} @{post.get('owner')}: {(post.get('caption') or '')[:70]!r}")
            if not dry_run and i % CHECKPOINT_EVERY == 0 and results:
                merge_metadata(account, results, categories)
                results = {}
                print(f"  … {i}/{len(todo)}")
    if not dry_run and results:
        merge_metadata(account, results, categories)
    print(f"[{account}] zugeordnet {stats['assigned']}, nur Vorschlag {stats['suggested']}, "
          f"fehlgeschlagen {stats['failed']}")
    return stats


def main():
    parser = argparse.ArgumentParser(description="insta-save: Kategorien per Jev")
    parser.add_argument("--account", action="append", required=True, help="Account oder 'all'")
    parser.add_argument("--limit", type=int, help="nur die ersten N offenen Posts")
    parser.add_argument("--redo", action="store_true", help="auch automatische Zuordnungen neu bewerten")
    parser.add_argument("--dry-run", action="store_true", help="nur anzeigen, nichts speichern")
    args = parser.parse_args()

    accounts = args.account
    if "all" in accounts:
        accounts = sorted(p.name for p in POSTS_DIR.iterdir()
                          if p.is_dir() and (p / "posts-index.json").exists())
    for account in accounts:
        categorize(account, limit=args.limit, redo=args.redo, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
