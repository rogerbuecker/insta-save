# Instagram Saved Posts Organizer

A comprehensive application to download, organize, and manage your saved Instagram posts with an advanced web interface.

## Features

### Backend (Python Scraper)
- Download all your saved Instagram posts
- Save both images and videos
- Support for carousel posts (multiple images/videos)
- Extract comprehensive metadata (captions, hashtags, tagged users, location, engagement metrics)
- Session persistence (no need to login every time)
- Two-factor authentication support
- Limit the number of posts to download

### Frontend (React Web Interface)
- **Modern UI**: Clean, responsive design with dark mode support
- **Smart Organization**:
  - AI-powered category suggestions based on post content
  - Bulk categorization workflow with guided interface
  - Custom notes for each post
  - Smart collections showing top hashtags
- **Advanced Search & Filtering**:
  - Search by caption or username
  - Filter by category, hashtag, or media type
  - Sort by date (newest/oldest first)
  - View all available hashtags without limit
- **Enhanced Media Display**:
  - Carousel viewer with keyboard navigation
  - Full engagement metrics (likes, comments)
  - Tagged users display
  - Alt text accessibility information
  - Location details with Instagram links
- **Duplicate Detection**:
  - Automatic detection of exact and similar duplicates
  - Auto-clean exact duplicates with one click
  - Merge metadata from duplicate posts
  - Manual review options
- **Print-Friendly Recipe View**:
  - Special print layout for recipe posts
  - Clean formatting optimized for physical copies
- **Grid Customization**:
  - Switch between grid and list views
  - Responsive layout adapting to screen size

## Requirements

- Python 3.6 or higher
- Node.js 18 or higher
- Instagram account

## Installation

### Quick Setup (Recommended)

1. Clone this repository:
```bash
git clone <your-repo-url>
cd insta-save
```

2. Run the setup script:
```bash
./setup.sh
```

This will create a virtual environment and install all dependencies.

3. Install frontend dependencies:
```bash
cd frontend
npm install
```

### Manual Setup

If you prefer to set up manually:

```bash
# Backend setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend setup
cd frontend
npm install
```

## Usage

### Step 1: Download Instagram Posts

Run the scraper to download your saved posts:

```bash
./run.sh
```

Or manually:
```bash
source venv/bin/activate
python insta_scraper.py
```

The script will prompt you to:
1. Login with your Instagram credentials
2. Enter 2FA code if enabled
3. Choose how many posts to download (or press Enter for all)

### Step 2: Start the Backend Server

```bash
cd frontend
node server.js
```

The API server will start on `http://localhost:3001`

### Step 3: Start the Frontend Development Server

In a new terminal:
```bash
cd frontend
npm run dev
```

The web interface will open at `http://localhost:5173` (or 5174 if 5173 is in use)

### Using the Web Interface

1. **Browse Posts**: View all your downloaded posts in grid or list view
2. **Categorize Posts**:
   - Click "Categorize X Posts" to batch categorize uncategorized posts
   - Use AI suggestions for quick categorization
   - Add custom categories as needed
3. **Search & Filter**:
   - Use the search bar to find posts by caption or username
   - Filter by category, hashtag, or media type
   - Click hashtag collections for quick filtering
4. **View Details**: Click any post to see full details including:
   - All carousel images
   - Engagement metrics
   - Tagged users
   - Location information
   - Alt text
5. **Find Duplicates**: Click "Find Duplicates" to detect and manage duplicate posts
6. **Print Recipes**: For posts categorized as "Recipes", use the "Print Recipe" button for a clean print layout
7. **Dark Mode**: Toggle dark mode with the moon/sun icon

## Project Structure

```
insta-save/
├── insta_scraper.py          # Python scraper
├── requirements.txt          # Python dependencies
├── setup.sh                  # Setup script
├── run.sh                    # Run scraper script
├── saved_posts/              # Downloaded posts directory
│   ├── metadata.json         # Post metadata storage
│   ├── *.json                # Individual post data
│   └── *.jpg/*.mp4           # Media files
└── frontend/
    ├── server.js             # Express API server
    ├── package.json          # Node dependencies
    ├── vite.config.ts        # Vite configuration
    └── src/
        ├── App.tsx           # Main application
        ├── types.ts          # TypeScript definitions
        ├── components/       # React components
        │   ├── PostCard.tsx
        │   ├── PostDetailModal.tsx
        │   ├── CategorizationModal.tsx
        │   ├── CarouselViewer.tsx
        │   ├── DuplicateDetection.tsx
        │   ├── SmartCollections.tsx
        │   └── PrintView.tsx
        └── hooks/            # Custom React hooks
            └── useLocalStorage.ts
```

## API Endpoints

The backend server provides the following REST API:

- `GET /api/posts` - Get all posts with metadata
- `GET /api/posts/:id` - Get single post details
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Add new category
- `PUT /api/posts/:id/metadata` - Update post metadata
- `DELETE /api/posts/:id` - Delete post
- `GET /api/posts/:id/suggest-categories` - Get AI category suggestions
- `GET /api/duplicates` - Find duplicate posts
- `POST /api/duplicates/auto-clean` - Auto-delete exact duplicates
- `POST /api/duplicates/merge` - Merge duplicate metadata

## Features in Detail

### AI Category Suggestions

The system uses keyword matching to suggest relevant categories:
- **Recipes**: Detects food-related keywords
- **DIY**: Identifies craft and handmade content
- **Tutorial**: Finds how-to guides
- **Funny**: Spots humor and meme content
- **Ideas/Inspiration**: Recognizes creative content
- And more...

### Duplicate Detection

Two types of duplicates are detected:
- **Exact Duplicates** (100% match): Same owner, caption, and posted within 1 hour
- **Similar Duplicates** (>80% match): Same owner, similar caption, posted within 24 hours

Actions available:
- Auto-clean all exact duplicates
- Merge metadata (combine categories and notes)
- Delete individual posts
- Keep both posts

### Dark Mode

Comprehensive dark mode support using CSS variables:
- Automatic theme persistence via localStorage
- Smooth transitions
- Optimized for readability in both modes

## Important Notes

- **Two-Factor Authentication**: Fully supported. Your session is saved after initial 2FA verification.
- **Session Persistence**: Login sessions are saved to `.session-<username>` files. Keep these secure.
- **Rate Limiting**: Instagram may rate limit downloads. Use the limit parameter for large collections.
- **Privacy**: Credentials are never stored, only encrypted session tokens.
- **Data Storage**: All post data is stored locally in `saved_posts/` directory.

## Troubleshooting

### Backend Issues

**"Login required" error**
```bash
rm .session-your_username
./run.sh
```

**Rate limiting**
- Wait a few hours before retrying
- Download in smaller batches using the limit parameter

### Frontend Issues

**Port already in use**
- Vite will automatically use the next available port (5174, 5175, etc.)

**Backend server not responding**
- Ensure `server.js` is running on port 3001
- Check that `saved_posts/` directory exists

**Posts not loading**
- Verify posts were downloaded successfully
- Check `saved_posts/metadata.json` exists

## Production Deployment

For production use:

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Serve the built files with your preferred web server (nginx, Apache, etc.)

3. Configure the API server URL in production environment

4. Ensure proper security:
   - Don't commit `.session-*` files
   - Keep `saved_posts/` directory secure
   - Use HTTPS in production
   - Set appropriate CORS policies

## Development

### Adding New Categories

Edit the `CATEGORY_KEYWORDS` object in `frontend/server.js`:

```javascript
const CATEGORY_KEYWORDS = {
  "Your Category": ["keyword1", "keyword2", "#hashtag"],
  // ...
};
```

### Customizing Grid Layout

Modify CSS variables in `frontend/src/index.css`:

```css
:root {
  --grid-columns: auto-fill;
  --grid-min-width: 320px;
  --grid-gap: 24px;
}
```

## Disclaimer

This tool is for personal use only. Ensure compliance with Instagram's Terms of Service. Respect content creators' rights and use responsibly.

## License

MIT License - Feel free to modify and use as needed.

## Credits

Built with:
- Python + Instaloader (backend scraper)
- React + TypeScript (frontend)
- Vite (build tool)
- Express.js (API server)
