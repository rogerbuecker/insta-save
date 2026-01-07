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

    def get_saved_posts(self, output_dir="saved_posts", limit=None):
        """
        Fetch and download saved posts

        Args:
            output_dir: Directory to save posts
            limit: Maximum number of posts to download (None for all)
        """
        try:
            if not self.username:
                print("Error: Not logged in")
                return

            # Create output directory
            Path(output_dir).mkdir(parents=True, exist_ok=True)

            print(f"\nFetching saved posts for {self.username}...")
            profile = instaloader.Profile.from_username(self.loader.context, self.username)

            saved_posts = profile.get_saved_posts()

            posts_data = []
            count = 0

            print(f"Starting download to {output_dir}/\n")

            for post in saved_posts:
                if limit and count >= limit:
                    break

                count += 1
                print(f"[{count}] Downloading post from @{post.owner_username}")
                print(f"    URL: https://www.instagram.com/p/{post.shortcode}/")

                try:
                    # Download post
                    self.loader.download_post(post, target=output_dir)

                    # Collect metadata
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
                    posts_data.append(post_info)

                    print(f"    ✓ Downloaded successfully\n")

                except Exception as e:
                    print(f"    ✗ Error downloading post: {str(e)}\n")
                    continue

            # Save summary JSON
            summary_file = os.path.join(output_dir, "saved_posts_summary.json")
            with open(summary_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'username': self.username,
                    'download_date': datetime.now().isoformat(),
                    'total_posts': len(posts_data),
                    'posts': posts_data
                }, f, indent=2, ensure_ascii=False)

            print(f"\n{'='*50}")
            print(f"✓ Download complete!")
            print(f"  Total posts downloaded: {len(posts_data)}")
            print(f"  Output directory: {output_dir}/")
            print(f"  Summary file: {summary_file}")
            print(f"{'='*50}")

        except instaloader.exceptions.LoginRequiredException:
            print("Error: Login required. Please login first.")
        except Exception as e:
            print(f"Error fetching saved posts: {str(e)}")


def main():
    """Main function"""
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
                    limit_input = input("\nEnter max number of posts to download (press Enter for all): ")
                    limit = int(limit_input) if limit_input.strip() else None

                    scraper.get_saved_posts(limit=limit)
                return

    # New login
    print("\nLogin to Instagram:")
    username = input("Username: ")

    from getpass import getpass
    password = getpass("Password: ")

    scraper = InstagramSavedPostsScraper(username=username)

    if scraper.login(username, password):
        limit_input = input("\nEnter max number of posts to download (press Enter for all): ")
        limit = int(limit_input) if limit_input.strip() else None

        scraper.get_saved_posts(limit=limit)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nOperation cancelled by user")
        sys.exit(0)
