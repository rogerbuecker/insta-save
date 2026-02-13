import React, { useEffect, useState } from 'react';
import type { Post } from '../types';
import CarouselViewer from './CarouselViewer';
import PrintView from './PrintView';
import { getMediaUrl, formatDate } from '../utils/media';
import './PostDetailModal.css';

interface PostDetailModalProps {
  post: Post;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ post, onClose, onEdit, onDelete }) => {
  const [showPrintView, setShowPrintView] = useState(false);

  const displayUrl = getMediaUrl(post.displayUrl);
  const videoUrl = getMediaUrl(post.videoUrl);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  return (
    <div className="post-detail-overlay" onClick={onClose}>
      <div className="post-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="close-modal-btn" aria-label="Close">
          ×
        </button>

        <div className="detail-media-section">
          {post.isCarousel && post.carouselItems.length > 0 ? (
            <CarouselViewer items={post.carouselItems} />
          ) : post.isVideo ? (
            <>
              <video
                src={videoUrl}
                poster={displayUrl}
                controls
                className="detail-media"
                autoPlay
                loop
              />
              <span className="detail-video-badge">▶ Video</span>
            </>
          ) : (
            <img src={displayUrl} alt={post.caption} className="detail-media" />
          )}
        </div>

        <div className="detail-info-section">
          <div className="detail-header">
            <div className="detail-owner-row">
              <span className="detail-owner">@{post.owner}</span>
              {post.postUrl && (
                <a
                  href={post.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-original-link"
                >
                  🔗 View on Instagram
                </a>
              )}
            </div>
            <div className="detail-date">{formatDate(post.timestamp)}</div>
            {post.location && (
              <div className="detail-location">
                📍 <span>{post.location}</span>
              </div>
            )}
          </div>

          <div className="detail-body">
            {post.caption && (
              <div className="detail-section">
                <div className="detail-section-title">📝 Caption</div>
                <div className="detail-caption">{post.caption}</div>
              </div>
            )}

            {post.hashtags.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-title">🏷️ Hashtags ({post.hashtags.length})</div>
                <div className="detail-hashtags">
                  {post.hashtags.map((tag, idx) => (
                    <span key={idx} className="detail-hashtag">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Enhanced metadata */}
            {post.engagement && (post.engagement.likes > 0 || post.engagement.comments > 0) && (
              <div className="detail-section">
                <div className="detail-section-title">💬 Engagement</div>
                <div className="detail-engagement">
                  {post.engagement.likes > 0 && (
                    <span className="engagement-stat">
                      ❤️ {post.engagement.likes.toLocaleString()} likes
                    </span>
                  )}
                  {post.engagement.comments > 0 && (
                    <span className="engagement-stat">
                      💬 {post.engagement.comments.toLocaleString()} comments
                    </span>
                  )}
                </div>
              </div>
            )}

            {post.taggedUsers && post.taggedUsers.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-title">👥 Tagged Users ({post.taggedUsers.length})</div>
                <div className="detail-tagged-users">
                  {post.taggedUsers.map((user, idx) => (
                    <span key={idx} className="tagged-user">
                      @{user.username}
                      {user.fullName && <span className="user-fullname"> ({user.fullName})</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {post.altText && (
              <div className="detail-section">
                <div className="detail-section-title">♿ Alt Text</div>
                <div className="detail-alt-text">{post.altText}</div>
              </div>
            )}

            {post.locationDetails && (
              <div className="detail-section">
                <div className="detail-section-title">📍 Location Details</div>
                <div className="detail-location-info">
                  <div className="location-name">{post.locationDetails.name}</div>
                  {post.locationDetails.slug && (
                    <a
                      href={`https://www.instagram.com/explore/locations/${post.locationDetails.id}/${post.locationDetails.slug}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="location-link"
                    >
                      View on Instagram →
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="detail-section">
              <div className="detail-section-title">📂 Categories</div>
              {post.categories.length > 0 ? (
                <div className="detail-categories">
                  {post.categories.map((cat, idx) => (
                    <span key={idx} className="detail-category-tag">{cat}</span>
                  ))}
                </div>
              ) : (
                <div className="detail-no-content">No categories assigned</div>
              )}
            </div>

            <div className="detail-section">
              <div className="detail-section-title">📄 Notes</div>
              {post.notes ? (
                <div className="detail-notes">{post.notes}</div>
              ) : (
                <div className="detail-no-content">No notes added</div>
              )}
            </div>
          </div>

          <div className="detail-footer">
            <button onClick={onEdit} className="detail-edit-btn">
              ✏️ Edit Categories & Notes
            </button>
            {post.categories.includes('Recipes') && (
              <button onClick={() => setShowPrintView(true)} className="detail-print-btn">
                🖨️ Print Recipe
              </button>
            )}
            <button onClick={onDelete} className="detail-delete-btn">
              🗑️ Delete Post
            </button>
          </div>
        </div>
      </div>

      {showPrintView && (
        <PrintView post={post} onClose={() => setShowPrintView(false)} />
      )}
    </div>
  );
};

export default PostDetailModal;
