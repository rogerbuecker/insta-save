import React, { useEffect } from 'react';
import type { Post } from '../types';
import { getMediaUrl } from '../utils/media';
import './PrintView.css';

interface PrintViewProps {
  post: Post;
  onClose: () => void;
}

const PrintView: React.FC<PrintViewProps> = ({ post, onClose }) => {
  useEffect(() => {
    // Auto-trigger print dialog after component mounts
    const timer = setTimeout(() => {
      window.print();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const displayUrl = getMediaUrl(post.displayUrl);

  return (
    <div className="print-view-overlay" onClick={onClose}>
      <div className="print-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="print-header">
          <h2>Print Recipe</h2>
          <button onClick={onClose} className="print-close-btn">×</button>
        </div>

        <div className="print-preview">
          <div className="print-content">
            {/* Recipe Title */}
            <div className="print-title">
              {post.caption.split('\n')[0] || 'Recipe'}
            </div>

            {/* Recipe Image */}
            {displayUrl && (
              <div className="print-image-container">
                <img
                  src={displayUrl}
                  alt={post.altText || post.caption}
                  className="print-image"
                />
              </div>
            )}

            {/* Recipe Details */}
            {post.caption && (
              <div className="print-section">
                <div className="print-section-title">Recipe</div>
                <div className="print-text">{post.caption}</div>
              </div>
            )}

            {/* Notes */}
            {post.notes && (
              <div className="print-section">
                <div className="print-section-title">Notes</div>
                <div className="print-text">{post.notes}</div>
              </div>
            )}

            {/* Source */}
            <div className="print-section">
              <div className="print-section-title">Source</div>
              <div className="print-text">
                From: @{post.owner}
                {post.postUrl && (
                  <div className="print-source-url">{post.postUrl}</div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="print-footer">
              Saved from Instagram on {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="print-actions">
          <button onClick={() => window.print()} className="print-btn">
            🖨️ Print Recipe
          </button>
          <button onClick={onClose} className="cancel-print-btn">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintView;
