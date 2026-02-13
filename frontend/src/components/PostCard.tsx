import React, { useState } from 'react';
import type { Post } from '../types';
import PostDetailModal from './PostDetailModal';
import DeleteConfirmModal from './DeleteConfirmModal';
import AddCategoryModal from './AddCategoryModal';
import { API_URL } from '../config';
import { getMediaUrl, formatDate } from '../utils/media';
import './PostCard.css';

interface PostCardProps {
  post: Post;
  viewMode: 'grid' | 'list';
  availableCategories: string[];
  onPostUpdate: (postId: string, updates: Partial<Post>) => void;
  onPostDelete: (postId: string) => void;
  onCategoryAdd: (category: string) => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, viewMode, availableCategories, onPostUpdate, onPostDelete, onCategoryAdd }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingNotes, setEditingNotes] = useState(post.notes);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(post.categories);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const displayUrl = getMediaUrl(post.displayUrl);
  const videoUrl = getMediaUrl(post.videoUrl);

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`${API_URL}/api/posts/${post.id}/metadata`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          categories: selectedCategories,
          notes: editingNotes,
        }),
      });

      if (response.ok) {
        onPostUpdate(post.id, {
          categories: selectedCategories,
          notes: editingNotes,
        });
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  };

  const handleCancel = () => {
    setSelectedCategories(post.categories);
    setEditingNotes(post.notes);
    setIsEditing(false);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't open modal if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('a')
    ) {
      return;
    }
    setShowDetailModal(true);
  };

  const handleEdit = () => {
    setShowDetailModal(false);
    setIsEditing(true);
  };

  const handleDeleteClick = () => {
    setShowDetailModal(false);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    try {
      const response = await fetch(`${API_URL}/api/posts/${post.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onPostDelete(post.id);
        setShowDeleteConfirm(false);
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  const handleAddCategory = (category: string) => {
    onCategoryAdd(category);
    setShowAddCategory(false);
  };

  return (
    <>
      <div className={`post-card ${viewMode}`} onClick={handleCardClick}>
        <div className="post-media">
          {post.isCarousel && post.carouselItems.length > 0 ? (
            <div className="carousel-container">
              <img
                src={getMediaUrl(post.carouselItems[0].displayUrl)}
                alt={post.caption}
                className="post-image"
              />
              <span className="carousel-badge">📷 {post.carouselItems.length}</span>
            </div>
          ) : post.isVideo ? (
            <div className="video-container">
              <video
                src={videoUrl}
                poster={displayUrl}
                controls
                className="post-image"
                onClick={(e) => e.stopPropagation()}
              />
              <span className="video-badge">▶ Video</span>
            </div>
          ) : (
            <img src={displayUrl} alt={post.caption} className="post-image" />
          )}
        </div>

      <div className="post-content">
        <div className="post-header">
          <div className="post-header-left">
            <span className="post-owner">@{post.owner}</span>
            {post.postUrl && (
              <a
                href={post.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="original-link"
                title="View on Instagram"
              >
                🔗 Original
              </a>
            )}
          </div>
          <div className="post-header-right">
            <span className="post-date">{formatDate(post.timestamp)}</span>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="delete-btn-card"
              title="Delete post"
            >
              🗑️
            </button>
          </div>
        </div>

        {post.location && (
          <div className="post-location">
            📍 {post.location}
          </div>
        )}

        {post.caption && (
          <div className="post-caption">
            {viewMode === 'grid'
              ? truncateText(post.caption, 100)
              : post.caption
            }
          </div>
        )}

        {post.hashtags.length > 0 && (
          <div className="post-hashtags">
            {post.hashtags.slice(0, 5).map((tag, idx) => (
              <span key={idx} className="hashtag">{tag}</span>
            ))}
            {post.hashtags.length > 5 && (
              <span className="hashtag-more">+{post.hashtags.length - 5} more</span>
            )}
          </div>
        )}

        {/* Categories */}
        <div className="post-categories-section">
          <div className="categories-header">
            <strong>Categories:</strong>
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} className="edit-btn">
                ✏️ Edit
              </button>
            )}
          </div>

          {isEditing ? (
            <>
              <div className="categories-edit">
                {availableCategories.map(category => (
                  <label key={category} className="category-checkbox">
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
                  className="add-category-btn-inline"
                >
                  + Add New
                </button>
              </div>
            </>
          ) : (
            <div className="categories-display">
              {post.categories.length > 0 ? (
                post.categories.map((cat, idx) => (
                  <span key={idx} className="category-tag">{cat}</span>
                ))
              ) : (
                <span className="no-categories">No categories</span>
              )}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="post-notes-section">
          <strong>Notes:</strong>
          {isEditing ? (
            <textarea
              value={editingNotes}
              onChange={(e) => setEditingNotes(e.target.value)}
              placeholder="Add your notes here..."
              className="notes-textarea"
              rows={3}
            />
          ) : (
            <div className="notes-display">
              {post.notes || <span className="no-notes">No notes</span>}
            </div>
          )}
        </div>

        {/* Edit buttons */}
        {isEditing && (
          <div className="edit-actions">
            <button onClick={handleSave} className="save-btn">
              💾 Save
            </button>
            <button onClick={handleCancel} className="cancel-btn">
              ✖ Cancel
            </button>
          </div>
        )}
      </div>
    </div>

      {showDetailModal && (
        <PostDetailModal
          post={post}
          onClose={() => setShowDetailModal(false)}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmModal
          post={post}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showAddCategory && (
        <AddCategoryModal
          existingCategories={availableCategories}
          onAdd={handleAddCategory}
          onCancel={() => setShowAddCategory(false)}
        />
      )}
    </>
  );
};

export default PostCard;
