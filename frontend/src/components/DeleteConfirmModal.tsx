import React, { useEffect } from 'react';
import type { Post } from '../types';
import './DeleteConfirmModal.css';

interface DeleteConfirmModalProps {
  post: Post;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ post, onConfirm, onCancel }) => {
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="delete-confirm-overlay" onClick={onCancel}>
      <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="delete-confirm-icon">⚠️</div>
        <h2 className="delete-confirm-title">Delete Post?</h2>
        <p className="delete-confirm-message">
          This action cannot be undone. This will permanently delete the post and all associated media files.
        </p>

        <div className="delete-confirm-post-info">
          <div className="delete-confirm-post-owner">@{post.owner}</div>
          {post.caption && (
            <div className="delete-confirm-post-caption">
              {truncateText(post.caption, 150)}
            </div>
          )}
        </div>

        <div className="delete-confirm-actions">
          <button onClick={onCancel} className="delete-cancel-btn">
            Cancel
          </button>
          <button onClick={onConfirm} className="delete-confirm-btn">
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
