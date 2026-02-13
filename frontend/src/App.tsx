import { useState, useEffect, useMemo } from 'react';
import PostCard from './components/PostCard';
import SearchFilters from './components/SearchFilters';
import CategorizationModal from './components/CategorizationModal';
import DuplicateDetection from './components/DuplicateDetection';
import SmartCollections from './components/SmartCollections';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Post, FilterState, SortOption, ViewMode } from './types';
import { apiFetch, UnauthorizedError, hasApiSecret, setApiSecret } from './utils/api';
import './App.css';

function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(hasApiSecret());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [filters, setFilters] = useState<FilterState>({
    searchQuery: '',
    category: '',
    hashtag: '',
    mediaType: 'all',
  });
  const [showCategorizationModal, setShowCategorizationModal] = useState(false);
  const [showDuplicateDetection, setShowDuplicateDetection] = useState(false);

  // Dark mode state with localStorage persistence
  const [isDarkMode, setIsDarkMode] = useLocalStorage('theme', false);

  // Apply dark mode theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchPosts();
      fetchCategories();
    }
  }, [isAuthenticated]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/posts');
      if (!response.ok) throw new Error('Failed to fetch posts');
      const data = await response.json();
      setPosts(data);
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) { setIsAuthenticated(false); return; }
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await apiFetch('/api/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) { setIsAuthenticated(false); return; }
      console.error('Failed to fetch categories:', err);
    }
  };

  const handleLogin = (secret: string) => {
    setApiSecret(secret);
    setIsAuthenticated(true);
  };

  const handlePostUpdate = (postId: string, updates: Partial<Post>) => {
    setPosts(prev => prev.map(post =>
      post.id === postId ? { ...post, ...updates } : post
    ));
  };

  const handlePostDelete = (postId: string) => {
    setPosts(prev => prev.filter(post => post.id !== postId));
  };

  const handleCategoryAdd = (category: string) => {
    setCategories(prev => [...prev, category]);
  };

  const availableHashtags = useMemo(() => {
    const hashtagSet = new Set<string>();
    posts.forEach(post => {
      post.hashtags.forEach(tag => hashtagSet.add(tag));
    });
    return Array.from(hashtagSet).sort();
  }, [posts]);

  const filteredAndSortedPosts = useMemo(() => {
    let filtered = posts.filter(post => {
      // Search query filter
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesCaption = post.caption.toLowerCase().includes(query);
        const matchesOwner = post.owner.toLowerCase().includes(query);
        if (!matchesCaption && !matchesOwner) return false;
      }

      // Category filter
      if (filters.category) {
        if (!post.categories.includes(filters.category)) return false;
      }

      // Hashtag filter
      if (filters.hashtag) {
        if (!post.hashtags.includes(filters.hashtag)) return false;
      }

      // Media type filter
      if (filters.mediaType !== 'all') {
        if (filters.mediaType === 'video' && !post.isVideo) return false;
        if (filters.mediaType === 'image' && post.isVideo) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'date-desc':
          return b.timestamp.localeCompare(a.timestamp);
        case 'date-asc':
          return a.timestamp.localeCompare(b.timestamp);
        default:
          return 0;
      }
    });

    return filtered;
  }, [posts, filters, sortOption]);

  const uncategorizedCount = useMemo(() => {
    return posts.filter(post => post.categories.length === 0).length;
  }, [posts]);

  if (!isAuthenticated) {
    return (
      <div className="app">
        <div className="auth-gate">
          <h2>Instagram Saved Posts</h2>
          <p>Enter the API secret to continue.</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const input = (e.target as HTMLFormElement).elements.namedItem('secret') as HTMLInputElement;
            if (input.value.trim()) handleLogin(input.value.trim());
          }}>
            <input name="secret" type="password" placeholder="API Secret" autoFocus />
            <button type="submit">Enter</button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading posts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app">
        <div className="error">
          <h2>Error loading posts</h2>
          <p>{error}</p>
          <button onClick={fetchPosts} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="theme-toggle-btn"
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>

        <div>
          <h1>Instagram Saved Posts</h1>
          <p className="subtitle">
            {filteredAndSortedPosts.length} of {posts.length} posts
          </p>
        </div>

        <div className="header-buttons">
          {uncategorizedCount > 0 && (
            <button
              onClick={() => setShowCategorizationModal(true)}
              className="categorize-btn"
            >
              📋 Categorize {uncategorizedCount} Post{uncategorizedCount !== 1 ? 's' : ''}
            </button>
          )}
          <button
            onClick={() => setShowDuplicateDetection(true)}
            className="duplicate-btn"
          >
            🔍 Find Duplicates
          </button>
        </div>
      </header>

      <SearchFilters
        filters={filters}
        onFiltersChange={setFilters}
        sortOption={sortOption}
        onSortChange={setSortOption}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        availableHashtags={availableHashtags}
        availableCategories={categories}
      />

      <SmartCollections
        posts={posts}
        onSelectHashtag={(hashtag) => setFilters(prev => ({ ...prev, hashtag }))}
        selectedHashtag={filters.hashtag}
      />

      <div className={`posts-container ${viewMode}`}>
        {filteredAndSortedPosts.length === 0 ? (
          <div className="no-results">
            {posts.length === 0 ? (
              <p>No posts yet. Run the scraper to download your saved Instagram posts.</p>
            ) : (
              <p>No posts found matching your filters.</p>
            )}
          </div>
        ) : (
          filteredAndSortedPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              viewMode={viewMode}
              availableCategories={categories}
              onPostUpdate={handlePostUpdate}
              onPostDelete={handlePostDelete}
              onCategoryAdd={handleCategoryAdd}
            />
          ))
        )}
      </div>

      {showCategorizationModal && (
        <CategorizationModal
          posts={posts}
          availableCategories={categories}
          onClose={() => setShowCategorizationModal(false)}
          onPostUpdate={handlePostUpdate}
          onCategoryAdd={handleCategoryAdd}
        />
      )}

      {showDuplicateDetection && (
        <DuplicateDetection
          posts={posts}
          onClose={() => setShowDuplicateDetection(false)}
          onPostDelete={handlePostDelete}
          onPostUpdate={handlePostUpdate}
        />
      )}
    </div>
  );
}

export default App;
