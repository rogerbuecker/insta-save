# Instagram Saved Posts Viewer

A modern web application to display, organize, categorize, and search through your saved Instagram posts.

## Features

- **Grid and List Views**: Toggle between compact grid view and detailed list view
- **Search**: Search posts by caption text or username
- **Filter by Media Type**: Filter to show only images or only videos
- **Filter by Hashtags**: Select from all available hashtags in your posts
- **Filter by Engagement**: Set minimum likes and comments thresholds
- **Sorting Options**: Sort by date (newest/oldest), likes, or comments
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

The dependencies should already be installed, but if not:

```bash
npm install
```

### Running the Application

#### Option 1: Using the Start Script (Recommended)

Simply run:

```bash
./start.sh
```

This will automatically start both the backend server and frontend dev server. Press `Ctrl+C` to stop both servers.

#### Option 2: Running Servers Separately

You need to run two separate processes:

**Terminal 1 - Start the Backend API Server:**

```bash
npm run server
```

This will start the Express server on `http://localhost:3001` which serves the saved posts data.

**Terminal 2 - Start the Frontend Development Server:**

```bash
npm run dev
```

This will start the Vite development server. Open the URL shown in the terminal (usually `http://localhost:5173`) in your browser.

## Usage

1. **Search Posts**: Use the search box to find posts by caption text or username
2. **Filter by Hashtag**: Select a hashtag from the dropdown to see only posts with that hashtag
3. **Filter by Media Type**: Choose "Images Only" or "Videos Only" to filter by media type
4. **Set Engagement Filters**: Enter minimum likes or comments to filter high-engagement posts
5. **Sort Results**: Use the sort dropdown to order posts by date, likes, or comments
6. **Switch Views**: Toggle between grid and list view using the view buttons

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── PostCard.tsx        # Individual post card component
│   │   ├── PostCard.css        # Post card styles
│   │   ├── SearchFilters.tsx   # Search and filter controls
│   │   └── SearchFilters.css   # Filter controls styles
│   ├── App.tsx                 # Main application component
│   ├── App.css                 # Main application styles
│   ├── types.ts                # TypeScript type definitions
│   ├── index.css               # Global styles
│   └── main.tsx                # Application entry point
├── server.js                   # Express backend API server
├── package.json                # Dependencies and scripts
└── README_USAGE.md            # This file
```

## API Endpoints

The backend server provides the following endpoints:

- `GET /api/posts` - Returns all saved posts with metadata
- `GET /api/posts/:id` - Returns a specific post by ID
- `/media/*` - Serves static media files from the saved_posts directory

## Technologies Used

- **Frontend**: React, TypeScript, Vite
- **Backend**: Express.js, Node.js
- **Styling**: CSS3 with responsive design
