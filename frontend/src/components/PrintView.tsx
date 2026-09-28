import { useEffect } from 'react';
import type { Post } from '../types';
import { postImageUrl } from '../utils/media';
import { useOverlay } from '../hooks/useOverlay';
import './PrintView.css';

interface PrintViewProps {
  post: Post;
  onClose: () => void;
}

/** Printable recipe card (opens the print dialog right away). */
const PrintView = ({ post, onClose }: PrintViewProps) => {
  useOverlay(true, onClose);

  useEffect(() => {
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, []);

  const displayUrl = postImageUrl(post);

  return (
    <div className="print-view-overlay" onClick={onClose}>
      <div className="print-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="print-header">
          <h2>Rezept drucken</h2>
          <button onClick={onClose} className="icon-btn" aria-label="Schließen">✕</button>
        </div>

        <div className="print-preview">
          <div className="print-content">
            <div className="print-title">{post.caption.split('\n')[0] || 'Rezept'}</div>

            {displayUrl && (
              <div className="print-image-container">
                <img src={displayUrl} alt={post.altText || ''} className="print-image" />
              </div>
            )}

            {post.caption && (
              <div className="print-section">
                <div className="print-section-title">Rezept</div>
                <div className="print-text">{post.caption}</div>
              </div>
            )}

            {post.notes && (
              <div className="print-section">
                <div className="print-section-title">Notizen</div>
                <div className="print-text">{post.notes}</div>
              </div>
            )}

            <div className="print-section">
              <div className="print-section-title">Quelle</div>
              <div className="print-text">
                Von @{post.owner}
                {post.postUrl && <div className="print-source-url">{post.postUrl}</div>}
              </div>
            </div>

            <div className="print-footer">
              Aus Instagram gespeichert · gedruckt am {new Date().toLocaleDateString('de-DE')}
            </div>
          </div>
        </div>

        <div className="print-actions">
          <button onClick={() => window.print()} className="print-btn">🖨 Drucken</button>
          <button onClick={onClose} className="cancel-print-btn">Abbrechen</button>
        </div>
      </div>
    </div>
  );
};

export default PrintView;
