# Deployment Guide: Cloudflare Pages + R2 (Free Tier)

## Part 1: Create a Cloudflare Account

1. Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. Enter your **email** and a **password**, click **Sign Up**
3. Check your email for a verification link and click it
4. No credit card needed. The free plan includes:
   - **Pages**: unlimited bandwidth, 500 builds/month, 100k function requests/day
   - **R2**: 10 GB storage, 10M Class B reads/month, 1M Class A writes/month, zero egress fees

---

## Part 2: Create the R2 Bucket

1. In the Cloudflare dashboard sidebar, click **R2 Object Storage**
2. Click **Create bucket**
3. Name it **`insta-save`** (must match `frontend/wrangler.toml`)
4. Pick the region closest to you (or leave as automatic), click **Create bucket**

### Enable Public Access

5. Inside the bucket, go to the **Settings** tab
6. Scroll to **Public Development URL** (formerly "r2.dev domain")
7. Click **Allow Access** and confirm the prompt
8. Copy the URL that appears (looks like `https://pub-xxxxxxxxxxxx.r2.dev`)
9. Open `frontend/wrangler.toml` and set:
   ```toml
   [vars]
   R2_PUBLIC_URL = "https://pub-xxxxxxxxxxxx.r2.dev"
   ```

---

## Part 3: Set Up rclone for R2

rclone syncs your local `saved_posts/` to the R2 bucket.

### Create an R2 API Token

1. In the dashboard, go to **R2 Object Storage** > **Manage R2 API Tokens** (top right)
2. Click **Create API Token**
3. Name: `rclone`, Permissions: **Object Read & Write**, Bucket: **insta-save**
4. Click **Create API Token**
5. Copy the **Access Key ID** and **Secret Access Key** (shown only once)

### Configure rclone

```bash
rclone config
```

When prompted:

| Prompt | Value |
|--------|-------|
| name | `r2` |
| Storage | Amazon S3 compatible (pick the S3 option) |
| provider | `Cloudflare` |
| access_key_id | *(paste your Access Key ID)* |
| secret_access_key | *(paste your Secret Access Key)* |
| endpoint | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |

Find your Account ID on the R2 overview page in the dashboard (right sidebar). Accept defaults for everything else.

### Set the Environment Variable

```bash
export RCLONE_REMOTE=r2:insta-save
```

Add this to your `~/.bashrc` or `~/.zshrc` so it persists across sessions.

---

## Part 4: Upload Your Data to R2

From the project root:

```bash
python insta_scraper.py
```

This will:
1. Download your saved Instagram posts (if not already done)
2. Build `posts-index.json`
3. Sync everything (JSON, images, videos) to R2 via rclone

Verify it worked: go to your R2 bucket in the dashboard — you should see `.json`, `.jpg`, and `.mp4` files.

---

## Part 5: Log In to Wrangler

```bash
cd frontend
npx wrangler login
```

This opens your browser. Click **Allow** to authorize Wrangler with your Cloudflare account.

---

## Part 6: Deploy to Cloudflare Pages

```bash
npm run deploy
```

This runs `npm run build && wrangler pages deploy dist`.

On **first run**, Wrangler will prompt you:
- **Project name**: enter `insta-save`
- **Production branch**: enter `main`

It creates the Pages project and deploys. Your site will be live at:

```
https://insta-save.pages.dev
```

> It won't fully work yet — you still need to bind R2 and set secrets (steps 7-8).

---

## Part 7: Bind R2 to Pages Functions

The Pages Functions need access to your R2 bucket:

1. Go to **Workers & Pages** in the dashboard sidebar
2. Click your **insta-save** project
3. Go to **Settings** > **Bindings**
4. Click **Add** > **R2 bucket**
5. Variable name: **`R2_BUCKET`**
6. Select your **insta-save** bucket
7. Click **Save**

---

## Part 8: Set Environment Variables

### R2_PUBLIC_URL

1. Still in project **Settings** > **Variables and Secrets**
2. Click **Add**
3. Name: **`R2_PUBLIC_URL`**
4. Value: your public bucket URL (e.g. `https://pub-xxxxxxxxxxxx.r2.dev`)
5. Click **Save**

### API_SECRET

This protects your API endpoints with bearer token authentication:

```bash
cd frontend
npx wrangler pages secret put API_SECRET
```

Enter a strong secret when prompted. This is what you'll type into the auth prompt on the frontend.

---

## Part 9: Redeploy

After setting bindings and secrets, redeploy for everything to take effect:

```bash
npm run deploy
```

---

## Part 10: Verify

1. Open `https://insta-save.pages.dev`
2. You'll see the auth gate — enter the `API_SECRET` you set
3. Your posts should load with images/videos served from R2

---

## Free Tier Limits

| Resource | Free Tier |
|----------|-----------|
| Pages bandwidth | Unlimited |
| Pages builds | 500/month |
| Function requests | 100,000/day |
| R2 storage | 10 GB/month |
| R2 reads (Class B) | 10M/month |
| R2 writes (Class A) | 1M/month |
| R2 egress | Always free |

---

## Useful Commands

```bash
# Deploy
npm run deploy                              # Build + deploy to production

# Local development
npm run dev                                 # Vite dev server (frontend only)
npm run server                              # Express API server (local data)
npm run pages:dev                           # Local Pages dev with R2 binding

# Secrets
npx wrangler pages secret put API_SECRET    # Set or update the API secret
npx wrangler pages secret list              # List configured secrets

# Scraper
python insta_scraper.py                     # Download + sync to R2
python insta_scraper.py --pull              # Pull from R2 to local
python insta_scraper.py --no-sync           # Download without syncing to R2
```

---

## References

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [R2 Public Buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Pages Functions Bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/)
