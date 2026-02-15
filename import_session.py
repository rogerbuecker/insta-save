#!/usr/bin/env python3
"""Import Instagram session from browser cookies — no login API calls needed."""

import sys
import pickle
import requests


def import_from_browser(username, browser="firefox"):
    """Extract Instagram cookies from browser and create an Instaloader session file."""
    try:
        import browser_cookie3
    except ImportError:
        print("Error: pip install browser_cookie3")
        return False

    browser_fn = {
        "firefox": browser_cookie3.firefox,
        "chrome": browser_cookie3.chrome,
        "chromium": browser_cookie3.chromium,
        "edge": browser_cookie3.edge,
    }.get(browser.lower())

    if not browser_fn:
        print(f"Error: unsupported browser '{browser}'. Use: firefox, chrome, chromium, edge")
        return False

    print(f"Extracting Instagram cookies from {browser}...")
    try:
        cj = browser_fn(domain_name=".instagram.com")
    except Exception as e:
        print(f"Error reading {browser} cookies: {e}")
        return False

    # Build cookie dict for the session file
    cookie_dict = {}
    for cookie in cj:
        cookie_dict[cookie.name] = cookie.value

    required = ["sessionid", "ds_user_id"]
    missing = [k for k in required if not cookie_dict.get(k)]
    if missing:
        print(f"Error: Missing required cookies: {missing}")
        print("Make sure you are logged into Instagram as this user in the browser.")
        return False

    print(f"  Found ds_user_id: {cookie_dict['ds_user_id']}")
    print(f"  Found sessionid: {cookie_dict['sessionid'][:8]}...")

    session_file = f".session-{username}"
    with open(session_file, "wb") as f:
        pickle.dump(cookie_dict, f)

    print(f"✓ Session saved to {session_file}")
    return True


def import_manual(username):
    """Create session file from manually provided cookie values."""
    print("Open Instagram in your browser, then:")
    print("  1. Press F12 to open DevTools")
    print("  2. Go to Application (Chrome) or Storage (Firefox) > Cookies > instagram.com")
    print("  3. Copy the values for 'sessionid' and 'ds_user_id'\n")

    sessionid = input("sessionid: ").strip()
    ds_user_id = input("ds_user_id: ").strip()

    if not sessionid or not ds_user_id:
        print("Error: both values are required")
        return False

    csrftoken = input("csrftoken (optional, press Enter to skip): ").strip()
    mid = input("mid (optional, press Enter to skip): ").strip()

    cookie_dict = {
        "sessionid": sessionid,
        "ds_user_id": ds_user_id,
    }
    if csrftoken:
        cookie_dict["csrftoken"] = csrftoken
    if mid:
        cookie_dict["mid"] = mid

    session_file = f".session-{username}"
    with open(session_file, "wb") as f:
        pickle.dump(cookie_dict, f)

    print(f"\n✓ Session saved to {session_file}")
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python import_session.py <username> [browser]")
        print("  python import_session.py <username> manual")
        print()
        print("Examples:")
        print("  python import_session.py hellomynameischaos firefox")
        print("  python import_session.py hellomynameischaos chrome")
        print("  python import_session.py hellomynameischaos manual")
        sys.exit(1)

    username = sys.argv[1]
    method = sys.argv[2] if len(sys.argv) > 2 else "firefox"

    if method == "manual":
        success = import_manual(username)
    else:
        success = import_from_browser(username, method)

    if success:
        print(f"\nNow run: python3 insta_scraper.py")

    sys.exit(0 if success else 1)
