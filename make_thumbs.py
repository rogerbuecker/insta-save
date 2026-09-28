#!/usr/bin/env python3
"""
Grid thumbnails for the web app: saved_posts/<account>/thumbs/<id>.webp

WebP, long edge 480 px, quality 70. Source is the post's image (for videos the poster
jpg next to the mp4), for carousels the first carousel image. Only missing thumbs are
created, so this is idempotent and cheap to call from indexer.build_index().
One image at a time with Pillow draft()/thumbnail() — never the whole set in memory.

Usage:
  make_thumbs.py --account hellomynameischaos
  make_thumbs.py --account all
"""

import argparse
import os
import sys
from pathlib import Path

THUMB_DIR = "thumbs"
THUMB_EDGE = 480
THUMB_QUALITY = 70
IMAGE_EXTS = ("jpg", "jpeg", "webp", "png", "heic")

DATA_DIR = Path(os.environ.get("INSTA_SAVE_DATA", "/srv/insta-save"))
POSTS_DIR = DATA_DIR / "saved_posts"


def _find_image(account_dir, stem):
    for ext in IMAGE_EXTS:
        p = account_dir / f"{stem}.{ext}"
        if p.exists():
            return p
    return None


def thumb_source(account_dir, post_id, carousel_ids=()):
    """Main image, else first carousel image (carousel_ids from the index, else _1.._20)."""
    src = _find_image(account_dir, post_id)
    if src:
        return src
    ids = list(carousel_ids) or [f"{post_id}_{i}" for i in range(1, 21)]
    for item_id in ids:
        src = _find_image(account_dir, item_id)
        if src:
            return src
    return None


def thumb_path(account_dir, post_id):
    return Path(account_dir) / THUMB_DIR / f"{post_id}.webp"


def make_thumb(src, dest):
    """Write one thumbnail. Returns True on success; never raises for bad images."""
    dest.parent.mkdir(exist_ok=True)
    tmp = dest.with_suffix(".webp.tmp")
    try:
        from PIL import Image, ImageOps  # lazy: indexer stays usable without Pillow

        with Image.open(src) as im:
            im.draft("RGB", (THUMB_EDGE, THUMB_EDGE))  # JPEG: decode at reduced scale
            im = ImageOps.exif_transpose(im)
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGB")
            im.thumbnail((THUMB_EDGE, THUMB_EDGE), Image.LANCZOS)
            im.save(tmp, "WEBP", quality=THUMB_QUALITY, method=4)
        tmp.replace(dest)
        return True
    except Exception as e:  # corrupt/unsupported (e.g. heic without plugin)
        print(f"  ! Thumb fehlgeschlagen für {src.name}: {e}", file=sys.stderr)
        tmp.unlink(missing_ok=True)
        return False


def ensure_thumb(account_dir, post_id, carousel_ids=()):
    """Create the thumb if missing. Returns the relative thumbUrl ('thumbs/<id>.webp') or ''."""
    account_dir = Path(account_dir)
    dest = thumb_path(account_dir, post_id)
    if dest.exists():
        return f"{THUMB_DIR}/{dest.name}"
    src = thumb_source(account_dir, post_id, carousel_ids)
    if src and make_thumb(src, dest):
        return f"{THUMB_DIR}/{dest.name}"
    return ""


def backfill(account):
    account_dir = POSTS_DIR / account
    made = skipped = failed = 0
    for json_file in sorted(account_dir.glob("*.json")):
        if json_file.name in ("metadata.json", "posts-index.json"):
            continue
        post_id = json_file.stem
        if thumb_path(account_dir, post_id).exists():
            skipped += 1
            continue
        if ensure_thumb(account_dir, post_id):
            made += 1
        else:
            failed += 1
    print(f"[{account}] neu: {made}, vorhanden: {skipped}, ohne Bild/fehlgeschlagen: {failed}")
    return made, skipped, failed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--account", required=True, help="Account-Ordner oder 'all'")
    args = ap.parse_args()
    if args.account == "all":
        accounts = sorted(d.name for d in POSTS_DIR.iterdir()
                          if d.is_dir() and not d.name.startswith(".") and (d / "posts-index.json").exists())
    else:
        accounts = [args.account]
    for account in accounts:
        if not (POSTS_DIR / account).is_dir():
            print(f"Account-Ordner fehlt: {account}", file=sys.stderr)
            return 1
        backfill(account)
    return 0


if __name__ == "__main__":
    sys.exit(main())
