"""
Post index for the web app (posts-index.json / accounts.json).

Two sources end up in the same account directory:
  - legacy instaloader downloads: <ts>_UTC.json with a GraphQL "node"
  - gallery-dl downloads: raw metadata in .gdl/<ts>_UTC.json, converted here into
    the same node shape so the index, server.js and every endpoint keep working.
Media filenames are identical for both (<ts>_UTC.jpg/.mp4, carousels <ts>_UTC_<n>.*),
which is also how gallery-dl recognises posts that instaloader already fetched.
"""

import json
import re
from pathlib import Path

GDL_DIR = ".gdl"
IMAGE_EXTS = ("jpg", "jpeg", "webp", "png", "heic")
SKIP_FILES = ("metadata.json", "posts-index.json")


def _media(output_path, stem, ext_list):
    for ext in ext_list:
        if (output_path / f"{stem}.{ext}").exists():
            return f"{stem}.{ext}"
    return ""


def convert_gallery_dl(output_dir):
    """Turn .gdl/*.json (gallery-dl post metadata) into instaloader-style <ts>_UTC.json.

    Existing post JSONs are never overwritten. Returns the number of converted posts.
    """
    output_path = Path(output_dir)
    gdl_path = output_path / GDL_DIR
    if not gdl_path.exists():
        return 0

    converted = 0
    for src in sorted(gdl_path.glob("*.json")):
        target = output_path / src.name
        if target.exists():
            continue
        try:
            with open(src, encoding="utf-8") as f:
                meta = json.load(f)
        except json.JSONDecodeError:
            continue

        stem = src.stem
        count = int(meta.get("count") or 1)
        # count includes files we never download (e.g. a reel's audio track) — only
        # sidecar_media_id marks a carousel, and children are the files actually on disk.
        if meta.get("sidecar_media_id"):
            children = [{"node": {
                "__typename": "GraphVideo" if (output_path / f"{stem}_{i}.mp4").exists() else "GraphImage",
                "accessibility_caption": "",
            }} for i in range(1, count + 1)
                if _media(output_path, f"{stem}_{i}", IMAGE_EXTS + ("mp4",))]
            typename = "GraphSidecar"
        else:
            children = []
            typename = "GraphVideo" if (output_path / f"{stem}.mp4").exists() else "GraphImage"

        tagged = meta.get("tagged_users") or []
        location = None
        if meta.get("location_id"):
            location = {"id": str(meta["location_id"]), "name": meta.get("location_name", ""),
                        "slug": meta.get("location_slug")}

        node = {
            "__typename": typename,
            "shortcode": meta.get("post_shortcode", ""),
            "id": str(meta.get("post_id", "")),
            "taken_at_date": meta.get("date"),
            "edge_media_to_caption": {"edges": [{"node": {"text": meta.get("description", "")}}]},
            "owner": {"id": str(meta.get("owner_id", "")), "username": meta.get("username") or "unknown",
                      "full_name": meta.get("fullname", "")},
            "location": location,
            "edge_liked_by": {"count": meta.get("likes", 0)},
            "edge_media_to_comment": {"count": 0},
            "edge_media_to_tagged_user": {"edges": [
                {"node": {"user": {"username": u.get("username", ""), "full_name": u.get("full_name", "")}}}
                for u in tagged
            ]},
            "accessibility_caption": "",
        }
        if children:
            node["edge_sidecar_to_children"] = {"edges": children}

        with open(target, "w", encoding="utf-8") as f:
            json.dump({"node": node, "source": "gallery-dl"}, f, ensure_ascii=False)
        converted += 1

    return converted


def build_index(output_dir):
    """Build posts-index.json from all post JSON files in the output directory.

    Pre-computes everything the frontend needs so the app loads instantly.
    """
    output_path = Path(output_dir)
    if not output_path.exists():
        return 0

    hashtag_re = re.compile(r'#[\wÀ-ɏḀ-ỿ]+')
    posts = []

    for json_file in sorted(output_path.glob("*.json")):
        if json_file.name in SKIP_FILES:
            continue

        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except (json.JSONDecodeError, KeyError):
            continue

        node = data.get("node", {})
        if not node:
            continue

        base_id = json_file.stem  # e.g. "2024-01-01_07-51-26_UTC"
        caption = ""
        caption_edges = node.get("edge_media_to_caption", {}).get("edges", [])
        if caption_edges:
            caption = caption_edges[0].get("node", {}).get("text", "")

        hashtags = [t.lower() for t in hashtag_re.findall(caption)]
        is_video = node.get("__typename") == "GraphVideo"
        is_carousel = node.get("__typename") == "GraphSidecar"

        carousel_items = []
        if is_carousel:
            edges = node.get("edge_sidecar_to_children", {}).get("edges", [])
            for idx, edge in enumerate(edges):
                item = edge.get("node", {})
                item_id = f"{base_id}_{idx + 1}"
                carousel_items.append({
                    "id": item_id,
                    "displayUrl": _media(output_path, item_id, IMAGE_EXTS),
                    "isVideo": item.get("__typename") == "GraphVideo",
                    "videoUrl": _media(output_path, item_id, ("mp4",)),
                    "altText": item.get("accessibility_caption", ""),
                    "dimensions": item.get("dimensions", {"width": 0, "height": 0}),
                })

        tagged_users = []
        for edge in node.get("edge_media_to_tagged_user", {}).get("edges", []):
            user = edge.get("node", {}).get("user", {})
            tagged_users.append({
                "username": user.get("username", ""),
                "fullName": user.get("full_name", ""),
            })

        posts.append({
            "id": base_id,
            "filename": json_file.name,
            "timestamp": base_id,
            "caption": caption,
            "postUrl": f"https://www.instagram.com/p/{node.get('shortcode', '')}/",
            "displayUrl": _media(output_path, base_id, IMAGE_EXTS),
            "isVideo": is_video,
            "videoUrl": _media(output_path, base_id, ("mp4",)),
            "owner": node.get("owner", {}).get("username", "unknown"),
            "location": (node.get("location") or {}).get("name"),
            "hashtags": hashtags,
            "isCarousel": is_carousel,
            "carouselItems": carousel_items,
            "altText": node.get("accessibility_caption", ""),
            "taggedUsers": tagged_users,
            "engagement": {
                "likes": node.get("edge_liked_by", {}).get("count", 0),
                "comments": node.get("edge_media_to_comment", {}).get("count", 0),
            },
            "locationDetails": {
                "id": node["location"]["id"],
                "name": node["location"]["name"],
                "slug": node["location"].get("slug"),
            } if node.get("location") else None,
        })

    index_file = output_path / "posts-index.json"
    tmp = index_file.with_suffix(".json.tmp")
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(posts, f, ensure_ascii=False)
    tmp.replace(index_file)

    print(f"✓ Built posts-index.json ({len(posts)} posts)")
    return len(posts)


def update_accounts_list(base_dir):
    """Update accounts.json with all account subdirectories."""
    base = Path(base_dir)
    accounts = sorted([
        d.name for d in base.iterdir()
        if d.is_dir() and (d / "posts-index.json").exists()
    ])
    with open(base / "accounts.json", "w") as f:
        json.dump(accounts, f)
    print(f"Updated accounts.json: {accounts}")
