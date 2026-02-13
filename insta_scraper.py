#!/usr/bin/env python3
"""
Instagram Saved Posts Scraper
Scrapes saved posts from your Instagram account
"""

import instaloader
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from datetime import datetime
import sys


class InstagramSavedPostsScraper:
    def __init__(self, username=None, session_file=None):
        """
        Initialize the Instagram scraper

        Args:
            username: Instagram username
            session_file: Path to session file for authentication
        """
        self.loader = instaloader.Instaloader(
            download_videos=True,
            download_video_thumbnails=True,
            download_geotags=False,
            download_comments=False,
            save_metadata=True,
            compress_json=False,
            post_metadata_txt_pattern=''
        )
        self.username = username
        self.session_file = session_file

    def _load_existing_shortcodes(self, output_dir):
        """
        Scan existing post JSON files in the output directory and extract shortcodes.
        Returns a set of shortcodes that have already been downloaded.
        """
        existing = set()
        output_path = Path(output_dir)
        if not output_path.exists():
            return existing

        for json_file in output_path.glob("*.json"):
            # Skip non-post files
            if json_file.name in ("metadata.json", "posts-index.json"):
                continue
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                shortcode = data.get("node", {}).get("shortcode")
                if shortcode:
                    existing.add(shortcode)
            except (json.JSONDecodeError, KeyError):
                continue

        return existing

    def update_accounts_list(self, base_dir="saved_posts"):
        """Update accounts.json with all account subdirectories."""
        base = Path(base_dir)
        accounts = sorted([
            d.name for d in base.iterdir()
            if d.is_dir() and (d / "posts-index.json").exists()
        ])
        with open(base / "accounts.json", "w") as f:
            json.dump(accounts, f)
        print(f"Updated accounts.json: {accounts}")

    def sync_to_cloud(self, output_dir="saved_posts"):
        """Push local saved_posts to cloud storage using rclone."""
        remote = os.environ.get('RCLONE_REMOTE', '')
        if not remote:
            return

        if not shutil.which('rclone'):
            print("\nWarning: RCLONE_REMOTE is set but rclone is not installed, skipping cloud sync")
            return

        print(f"\nSyncing to {remote}...")
        result = subprocess.run(
            ['rclone', 'sync', output_dir, remote, '--progress', '--transfers', '8'],
        )
        if result.returncode == 0:
            print("✓ Cloud sync complete")
        else:
            print("✗ Cloud sync failed")

    def sync_from_cloud(self, output_dir="saved_posts"):
        """Pull from cloud storage to local saved_posts using rclone."""
        remote = os.environ.get('RCLONE_REMOTE', '')
        if not remote:
            print("Error: RCLONE_REMOTE environment variable not set")
            print("  Set it to your rclone remote path, e.g.: export RCLONE_REMOTE=r2:insta-save")
            return False

        if not shutil.which('rclone'):
            print("Error: rclone is not installed")
            return False

        Path(output_dir).mkdir(parents=True, exist_ok=True)

        print(f"Pulling from {remote} to {output_dir}/...")
        result = subprocess.run(
            ['rclone', 'sync', remote, output_dir, '--progress', '--transfers', '8'],
        )
        if result.returncode == 0:
            print("✓ Pull complete")
            return True
        else:
            print("✗ Pull failed")
            return False

    def build_index(self, output_dir="saved_posts"):
        """
        Build posts-index.json from all post JSON files in the output directory.
        Pre-computes everything the frontend needs so the hosted app loads instantly.
        """
        output_path = Path(output_dir)
        if not output_path.exists():
            return

        hashtag_re = re.compile(r'#[\w\u00C0-\u024F\u1E00-\u1EFF]+')
        posts = []

        for json_file in sorted(output_path.glob("*.json")):
            if json_file.name in ("metadata.json", "posts-index.json"):
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

            # Check which media files exist locally
            has_jpg = (output_path / f"{base_id}.jpg").exists()
            has_mp4 = (output_path / f"{base_id}.mp4").exists()

            # Carousel items
            carousel_items = []
            if is_carousel:
                edges = node.get("edge_sidecar_to_children", {}).get("edges", [])
                for idx, edge in enumerate(edges):
                    item = edge.get("node", {})
                    item_id = f"{base_id}_{idx + 1}"
                    item_is_video = item.get("__typename") == "GraphVideo"
                    carousel_items.append({
                        "id": item_id,
                        "displayUrl": f"{item_id}.jpg" if (output_path / f"{item_id}.jpg").exists() else "",
                        "isVideo": item_is_video,
                        "videoUrl": f"{item_id}.mp4" if (output_path / f"{item_id}.mp4").exists() else "",
                        "altText": item.get("accessibility_caption", ""),
                        "dimensions": item.get("dimensions", {"width": 0, "height": 0}),
                    })

            # Tagged users
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
                "displayUrl": f"{base_id}.jpg" if has_jpg else "",
                "isVideo": is_video,
                "videoUrl": f"{base_id}.mp4" if has_mp4 else "",
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
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(posts, f, ensure_ascii=False)

        print(f"✓ Built posts-index.json ({len(posts)} posts)")

    def login(self, username=None, password=None):
        """
        Login to Instagram

        Args:
            username: Instagram username
            password: Instagram password
        """
        try:
            if self.session_file and os.path.exists(self.session_file):
                print(f"Loading session from {self.session_file}")
                self.loader.load_session_from_file(username or self.username, self.session_file)
                print("✓ Session loaded successfully")
            elif username and password:
                print(f"Logging in as {username}...")
                self.loader.login(username, password)
                self.username = username
                print("✓ Login successful")

                # Save session for future use
                session_file = f".session-{username}"
                self.loader.save_session_to_file(session_file)
                print(f"✓ Session saved to {session_file}")
            else:
                print("Error: No credentials or session file provided")
                return False

            return True
        except instaloader.exceptions.BadCredentialsException:
            print("Error: Invalid username or password")
            return False
        except instaloader.exceptions.TwoFactorAuthRequiredException:
            print("\n⚠ Two-factor authentication is required")
            print("Please enter your 2FA code:")
            two_factor_code = input("2FA Code: ").strip()

            try:
                self.loader.two_factor_login(two_factor_code)
                self.username = username
                print("✓ Login successful with 2FA")

                # Save session for future use
                session_file = f".session-{username}"
                self.loader.save_session_to_file(session_file)
                print(f"✓ Session saved to {session_file}")
                return True
            except Exception as e:
                print(f"Error: 2FA login failed - {str(e)}")
                return False
        except instaloader.exceptions.ConnectionException as e:
            print(f"Error: Connection issue - {str(e)}")
            print("Tip: Instagram may be rate limiting. Try again later.")
            return False
        except Exception as e:
            print(f"Error during login: {str(e)}")
            return False

    def get_saved_posts(self, output_dir="saved_posts", limit=None, full_resync=False):
        """
        Fetch and download saved posts incrementally.

        On subsequent runs, only new posts (not already in the output directory)
        are downloaded. Once enough consecutive already-downloaded posts are seen,
        the crawler stops early since Instagram returns saved posts newest-first.

        Args:
            output_dir: Directory to save posts
            limit: Maximum number of *new* posts to download (None for all)
            full_resync: If True, skip early stopping and check every post
        """
        # Number of consecutive already-downloaded posts before stopping early.
        EARLY_STOP_THRESHOLD = 20

        try:
            if not self.username:
                print("Error: Not logged in")
                return

            # Create output directory
            Path(output_dir).mkdir(parents=True, exist_ok=True)

            # Load index of already-downloaded posts
            existing_shortcodes = self._load_existing_shortcodes(output_dir)

            if existing_shortcodes:
                print(f"\nFound {len(existing_shortcodes)} previously downloaded posts")
            else:
                print("\nNo previous downloads found — performing full download")

            print(f"Fetching saved posts for {self.username}...")
            # Get user ID from session cookies to avoid the heavily
            # rate-limited web_profile_info endpoint (from_username).
            user_id = self.loader.context._session.cookies.get('ds_user_id')
            if user_id:
                profile = instaloader.Profile.from_id(self.loader.context, int(user_id))
            else:
                profile = instaloader.Profile.from_username(self.loader.context, self.username)

            saved_posts = profile.get_saved_posts()

            new_posts = []
            skipped = 0
            consecutive_known = 0
            checked = 0

            is_incremental = len(existing_shortcodes) > 0
            mode = "Syncing new" if is_incremental else "Downloading"
            print(f"{mode} posts to {output_dir}/\n")

            for post in saved_posts:
                # Stop if we've downloaded enough new posts
                if limit and len(new_posts) >= limit:
                    print(f"Reached download limit of {limit} new posts")
                    break

                checked += 1

                # Skip posts we already have
                if post.shortcode in existing_shortcodes:
                    skipped += 1
                    consecutive_known += 1

                    # Early stop: if we've seen many consecutive known posts,
                    # we've caught up to the previous download boundary
                    if not full_resync and is_incremental and consecutive_known >= EARLY_STOP_THRESHOLD:
                        print(f"  Seen {EARLY_STOP_THRESHOLD} consecutive known posts — caught up!")
                        break

                    continue

                # Reset consecutive counter when we find a new post
                consecutive_known = 0

                print(f"[new {len(new_posts)+1}] Downloading post from @{post.owner_username}")
                print(f"    URL: https://www.instagram.com/p/{post.shortcode}/")

                try:
                    self.loader.download_post(post, target=output_dir)

                    post_info = {
                        'shortcode': post.shortcode,
                        'url': f"https://www.instagram.com/p/{post.shortcode}/",
                        'owner_username': post.owner_username,
                        'caption': post.caption,
                        'date': post.date_utc.isoformat(),
                        'likes': post.likes,
                        'comments': post.comments,
                        'is_video': post.is_video,
                        'video_url': post.video_url if post.is_video else None,
                        'typename': post.typename
                    }
                    new_posts.append(post_info)

                    print(f"    ✓ Downloaded successfully\n")

                except Exception as e:
                    print(f"    ✗ Error downloading post: {str(e)}\n")
                    continue

            print(f"\n{'='*50}")
            if is_incremental:
                print(f"✓ Sync complete!")
                print(f"  New posts downloaded: {len(new_posts)}")
                print(f"  Already had: {skipped}")
                print(f"  Posts checked: {checked}")
            else:
                print(f"✓ Download complete!")
                print(f"  Total posts downloaded: {len(new_posts)}")
            print(f"  Output directory: {output_dir}/")
            print(f"{'='*50}")

        except instaloader.exceptions.LoginRequiredException:
            print("Error: Login required. Please login first.")
        except Exception as e:
            print(f"Error fetching saved posts: {str(e)}")


def main():
    """Main function"""
    import argparse

    parser = argparse.ArgumentParser(description="Instagram Saved Posts Scraper")
    parser.add_argument("--full-resync", action="store_true",
                        help="Check all saved posts instead of stopping early at known posts")
    parser.add_argument("--limit", type=int, default=None,
                        help="Maximum number of new posts to download")
    parser.add_argument("--pull", action="store_true",
                        help="Pull from cloud storage to local (no crawl)")
    parser.add_argument("--no-sync", action="store_true",
                        help="Skip cloud sync after crawling")
    args = parser.parse_args()

    print("="*50)
    print("Instagram Saved Posts Scraper")
    print("="*50 + "\n")

    # Migration check: warn if posts exist in old flat layout
    base = Path("saved_posts")
    if base.exists():
        old_files = [f for f in base.glob("*.json") if f.name not in ("accounts.json",)]
        if old_files:
            print("⚠  Found posts in saved_posts/ root (old layout).")
            print("   Multi-account support stores posts in saved_posts/<username>/")
            print("   Move your existing files, e.g.:")
            print("     mkdir -p saved_posts/YOUR_USERNAME")
            print("     mv saved_posts/*.json saved_posts/*.jpg saved_posts/*.mp4 saved_posts/YOUR_USERNAME/")
            print()

    scraper = InstagramSavedPostsScraper()

    # Pull mode: download from cloud and exit
    if args.pull:
        scraper.sync_from_cloud()
        return

    # Check for existing session files
    session_files = [f for f in os.listdir('.') if f.startswith('.session-')]

    if session_files:
        print("Found existing session files:")
        for i, sf in enumerate(session_files, 1):
            username = sf.replace('.session-', '')
            print(f"  {i}. {username}")

        choice = input("\nUse existing session? (y/n): ").lower()
        if choice == 'y':
            session_idx = int(input("Enter number: ")) - 1
            if 0 <= session_idx < len(session_files):
                session_file = session_files[session_idx]
                username = session_file.replace('.session-', '')

                scraper = InstagramSavedPostsScraper(username=username, session_file=session_file)
                if scraper.login():
                    if args.limit is None and not args.full_resync:
                        limit_input = input("\nEnter max number of new posts to download (press Enter for all): ")
                        limit = int(limit_input) if limit_input.strip() else None
                    else:
                        limit = args.limit

                    output_dir = f"saved_posts/{username}"
                    scraper.get_saved_posts(limit=limit, full_resync=args.full_resync, output_dir=output_dir)
                    scraper.build_index(output_dir=output_dir)
                    scraper.update_accounts_list()
                    if not args.no_sync:
                        scraper.sync_to_cloud()
                return

    # New login
    print("\nLogin to Instagram:")
    username = input("Username: ")

    from getpass import getpass
    password = getpass("Password: ")

    scraper = InstagramSavedPostsScraper(username=username)

    if scraper.login(username, password):
        if args.limit is None and not args.full_resync:
            limit_input = input("\nEnter max number of new posts to download (press Enter for all): ")
            limit = int(limit_input) if limit_input.strip() else None
        else:
            limit = args.limit

        output_dir = f"saved_posts/{username}"
        scraper.get_saved_posts(limit=limit, full_resync=args.full_resync, output_dir=output_dir)
        scraper.build_index(output_dir=output_dir)
        scraper.update_accounts_list()
        if not args.no_sync:
            scraper.sync_to_cloud()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user")
        sys.exit(0)
