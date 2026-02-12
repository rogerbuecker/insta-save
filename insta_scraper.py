#!/usr/bin/env python3
"""
Instagram Saved Posts Scraper
Scrapes saved posts from your Instagram account
"""

import instaloader
import json
import os
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
            if json_file.name in ("metadata.json", "saved_posts_summary.json"):
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

    def _load_existing_summary(self, output_dir):
        """Load existing summary data so new posts can be merged in."""
        summary_file = os.path.join(output_dir, "saved_posts_summary.json")
        if os.path.exists(summary_file):
            try:
                with open(summary_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return {p['shortcode']: p for p in data.get('posts', [])}
            except (json.JSONDecodeError, KeyError):
                pass
        return {}

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
            existing_summary = self._load_existing_summary(output_dir)

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

            # Merge new posts into existing summary
            for p in new_posts:
                existing_summary[p['shortcode']] = p

            summary_file = os.path.join(output_dir, "saved_posts_summary.json")
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'username': self.username,
                    'download_date': datetime.now().isoformat(),
                    'total_posts': len(existing_summary),
                    'posts': list(existing_summary.values())
                }, f, indent=2, ensure_ascii=False)

            print(f"\n{'='*50}")
            if is_incremental:
                print(f"✓ Sync complete!")
                print(f"  New posts downloaded: {len(new_posts)}")
                print(f"  Already had: {skipped}")
                print(f"  Posts checked: {checked}")
                print(f"  Total posts in library: {len(existing_summary)}")
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
    args = parser.parse_args()

    print("="*50)
    print("Instagram Saved Posts Scraper")
    print("="*50 + "\n")

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

                    scraper.get_saved_posts(limit=limit, full_resync=args.full_resync)
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

        scraper.get_saved_posts(limit=limit, full_resync=args.full_resync)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user")
        sys.exit(0)
