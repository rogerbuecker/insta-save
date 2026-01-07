import React, { useState, useEffect } from 'react';
import type { Post, CategorySuggestion } from '../types';
import AddCategoryModal from './AddCategoryModal';
import './CategorizationModal.css';

const API_URL = 'http://localhost:3001';

interface CategorizationModalProps {
  posts: Post[];
  availableCategories: string[];
  onClose: () => void;
  onPostUpdate: (postId: string, updates: Partial<Post>) => void;
  onCategoryAdd: (category: string) => void;
}

const CategorizationModal: React.FC<CategorizationModalProps> = ({
  posts,
  availableCategories,
  onClose,
  onPostUpdate,
  onCategoryAdd,
}) => {
  const uncategorizedPosts = posts.filter(post => post.categories.length === 0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const currentPost = uncategorizedPosts[currentIndex];

  useEffect(() => {
    if (currentPost) {
      setSelectedCategories(currentPost.categories || []);
      setNotes(currentPost.notes || '');
      fetchSuggestions(currentPost.id);
    }
  }, [currentIndex, currentPost]);

  useEffect(() => {
    if (uncategorizedPosts.length === 0) {
      setIsCompleted(true);
    }
  }, [uncategorizedPosts.length]);

  const fetchSuggestions = async (postId: string) => {
    try {
      setLoadingSuggestions(true);
      const response = await fetch(`${API_URL}/api/posts/${postId}/suggest-categories`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const getMediaUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${API_URL}${url}`;
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleSave = async () => {
    if (!currentPost) return;

    try {
      const response = await fetch(`${API_URL}/api/posts/${currentPost.id}/metadata`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categories: selectedCategories,
          notes: notes,
        }),
      });

      if (response.ok) {
        onPostUpdate(currentPost.id, {
          categories: selectedCategories,
          notes: notes,
        });

        // Move to next post or complete
        if (currentIndex < uncategorizedPosts.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          setIsCompleted(true);
        }
      }
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  };

  const handleSkip = () => {
    if (currentIndex < uncategorizedPosts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsCompleted(true);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleAddCategory = (category: string) => {
    onCategoryAdd(category);
    setShowAddCategory(false);
  };

  if (isCompleted || uncategorizedPosts.length === 0) {
    return (
      <div className="categorization-modal-overlay" onClick={onClose}>
        <div className="categorization-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body">
            <div className="completion-message">
              <h2>✅ All Done!</h2>
              <p>
                {posts.filter(p => p.categories.length === 0).length === 0
                  ? 'All posts have been categorized.'
                  : 'You\'ve reviewed all uncategorized posts.'}
              </p>
              <button onClick={onClose} className="done-btn">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentPost) return null;

  const displayUrl = getMediaUrl(currentPost.displayUrl);
  const videoUrl = getMediaUrl(currentPost.videoUrl);

  return (
    <div className="categorization-modal-overlay" onClick={onClose}>
      <div className="categorization-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Categorize Posts</h2>
            <div className="modal-progress">
              Post {currentIndex + 1} of {uncategorizedPosts.length}
            </div>
          </div>
          <button onClick={onClose} className="close-btn">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="categorization-content">
            <div className="post-preview">
              <div className="preview-media">
                {currentPost.isVideo ? (
                  <video
                    src={videoUrl}
                    poster={displayUrl}
                    controls
                    className="preview-video"
                  />
                ) : (
                  <img src={displayUrl} alt={currentPost.caption} className="preview-image" />
                )}
              </div>

              <div className="preview-details">
                <div className="preview-owner">@{currentPost.owner}</div>

                {currentPost.caption && (
                  <div className="preview-caption">{currentPost.caption}</div>
                )}

                {currentPost.hashtags.length > 0 && (
                  <div className="preview-hashtags">
                    {currentPost.hashtags.slice(0, 8).map((tag, idx) => (
                      <span key={idx} className="preview-hashtag">{tag}</span>
                    ))}
                    {currentPost.hashtags.length > 8 && (
                      <span className="preview-hashtag">+{currentPost.hashtags.length - 8} more</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="category-selection">
              <h3>Select Categories</h3>

              {/* AI Suggestions */}
              {!loadingSuggestions && suggestions.length > 0 && (
                <div className="ai-suggestions">
                  <div className="suggestions-header">
                    <span className="suggestions-title">✨ Suggested:</span>
                  </div>
                  <div className="suggestions-list">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.category}
                        onClick={() => {
                          if (!selectedCategories.includes(suggestion.category)) {
                            handleCategoryToggle(suggestion.category);
                          }
                        }}
                        className={`suggestion-chip ${selectedCategories.includes(suggestion.category) ? 'selected' : ''}`}
                        title={`${suggestion.confidence}% match - Keywords: ${suggestion.matchedKeywords.join(', ')}`}
                      >
                        {suggestion.category}
                        <span className="suggestion-confidence">{suggestion.confidence}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="category-options">
                {availableCategories.map(category => (
                  <label
                    key={category}
                    className={`category-option ${selectedCategories.includes(category) ? 'selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category)}
                      onChange={() => handleCategoryToggle(category)}
                    />
                    <span>{category}</span>
                  </label>
                ))}
                <button
                  onClick={() => setShowAddCategory(true)}
                  className="add-category-option"
                >
                  + Add New Category
                </button>
              </div>

              <div className="notes-section">
                <h3>Notes (Optional)</h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this post..."
                  className="notes-input"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div className="navigation-buttons">
            <button
              onClick={handlePrevious}
              className="nav-btn"
              disabled={currentIndex === 0}
            >
              ← Previous
            </button>
            <button onClick={handleSkip} className="nav-btn skip-btn">
              Skip
            </button>
          </div>
          <button onClick={handleSave} className="action-btn">
            {currentIndex < uncategorizedPosts.length - 1 ? 'Save & Next →' : 'Save & Finish'}
          </button>
        </div>
      </div>

      {showAddCategory && (
        <AddCategoryModal
          existingCategories={availableCategories}
          onAdd={handleAddCategory}
          onCancel={() => setShowAddCategory(false)}
        />
      )}
    </div>
  );
};

export default CategorizationModal;
