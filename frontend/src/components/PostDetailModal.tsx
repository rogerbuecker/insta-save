import { useState } from 'react';
import type { Post, PostActions } from '../types';
import CarouselViewer from './CarouselViewer';
import CategorySheet from './CategorySheet';
import BottomSheet from './BottomSheet';
import PrintView from './PrintView';
import { useOverlay } from '../hooks/useOverlay';
import { formatDate, isRecipePost } from '../utils/media';
import './PostDetailModal.css';

interface PostDetailModalProps {
  post: Post;
  position: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  enterDir: -1 | 0 | 1;
  categories: string[];
  actions: PostActions;
  onNavigate: (dir: -1 | 1) => void;
  onClose: () => void;
}

type Sheet = 'categories' | 'notes' | null;

const CAPTION_CLAMP = 220;

/** Full-screen post view with swipe navigation and the action bar in thumb reach. */
const PostDetailModal = ({
  post, position, total, hasPrev, hasNext, enterDir, categories, actions, onNavigate, onClose,
}: PostDetailModalProps) => {
  useOverlay(true, onClose);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [showPrint, setShowPrint] = useState(false);

  const longCaption = post.caption.length > CAPTION_CLAMP || post.caption.split('\n').length > 5;
  const recipeDone = Boolean(post.recipe?.path);
  const recipePending = !recipeDone && Boolean(post.recipe?.requestedAt);

  const openNotes = () => {
    setNoteDraft(post.notes);
    setSheet('notes');
  };

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label={`Beitrag von @${post.owner}`}>
      <header className="detail-top">
        <button className="detail-top-btn" onClick={onClose} aria-label="Schließen">✕</button>
        <span className="detail-top-title">@{post.owner}</span>
        <span className="detail-top-count">{position} / {total}</span>
      </header>

      <div className="detail-main">
        <div className="detail-media">
          <CarouselViewer
            key={post.id}
            post={post}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onNavigate={onNavigate}
            onDismiss={onClose}
            enterDir={enterDir}
          />
        </div>

        <div className="detail-side">
          <div className="detail-info">
            <div className="detail-meta">
              <strong>@{post.owner}</strong>
              <span> · {formatDate(post.timestamp)}</span>
              {post.location && <div className="detail-location">📍 {post.location}</div>}
            </div>

            {post.suggestion && (
              <div className="detail-banner">
                <span>Vorschlag: <strong>{post.suggestion.category}</strong></span>
                <button className="btn btn-primary btn-small" onClick={() => actions.acceptSuggestion(post)}>✓ Passt</button>
              </div>
            )}

            {(recipeDone || recipePending) && (
              <div className={`detail-recipe ${recipeDone ? 'done' : ''}`}>
                {recipeDone ? '✓ Im Rezeptbuch' : '🍳 Rezept wird erstellt – kommt per Telegram'}
              </div>
            )}

            {post.caption ? (
              <div className="detail-caption-wrap">
                <p className={`detail-caption ${longCaption && !captionOpen ? 'clamped' : ''}`}>{post.caption}</p>
                {longCaption && (
                  <button className="link-btn" onClick={() => setCaptionOpen(o => !o)}>
                    {captionOpen ? 'weniger' : 'mehr anzeigen'}
                  </button>
                )}
              </div>
            ) : (
              <p className="detail-muted">Keine Beschreibung</p>
            )}

            <div className="detail-section">
              <div className="detail-section-title">Kategorien</div>
              <div className="detail-chips">
                {post.categories.map(cat => (
                  <button key={cat} className="chip" onClick={() => setSheet('categories')}>{cat}</button>
                ))}
                <button className="chip chip-add" onClick={() => setSheet('categories')}>
                  {post.categories.length ? 'Ändern' : '+ Kategorie'}
                </button>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-title">Notiz</div>
              <button className="detail-note" onClick={openNotes}>
                {post.notes || <span className="detail-muted">Notiz hinzufügen …</span>}
              </button>
            </div>

            {post.hashtags.length > 0 && (
              <div className="detail-hashtags">{post.hashtags.join(' ')}</div>
            )}

            {isRecipePost(post) && (
              <button className="btn detail-print" onClick={() => setShowPrint(true)}>🖨 Rezept drucken</button>
            )}
          </div>

          <nav className="detail-actions" aria-label="Aktionen">
            <button
              className={`action ${post.favorite ? 'on fav' : ''}`}
              onClick={() => actions.updateMeta(post, { favorite: !post.favorite })}
              aria-pressed={post.favorite}
            >
              <span className="action-icon">{post.favorite ? '★' : '☆'}</span>
              <span className="action-label">Favorit</span>
            </button>
            <button
              className={`action ${post.tried ? 'on tried' : ''}`}
              onClick={() => actions.updateMeta(post, { tried: !post.tried })}
              aria-pressed={post.tried}
            >
              <span className="action-icon">✓</span>
              <span className="action-label">Probiert</span>
            </button>
            <button className="action" onClick={() => setSheet('categories')}>
              <span className="action-icon">🏷</span>
              <span className="action-label">Kategorie</span>
            </button>
            <button className={`action ${post.notes ? 'on' : ''}`} onClick={openNotes}>
              <span className="action-icon">📝</span>
              <span className="action-label">Notiz</span>
            </button>
            <button className={`action ${recipeDone ? 'on tried' : ''}`} onClick={() => actions.requestRecipe(post)}>
              <span className="action-icon">🍳</span>
              <span className="action-label">Rezept</span>
            </button>
            <button className="action" onClick={() => actions.share(post)}>
              <span className="action-icon">↗</span>
              <span className="action-label">Teilen</span>
            </button>
            {post.postUrl && (
              <a className="action" href={post.postUrl} target="_blank" rel="noopener noreferrer">
                <span className="action-icon">🔗</span>
                <span className="action-label">Insta</span>
              </a>
            )}
            <button className="action danger" onClick={() => actions.remove(post)}>
              <span className="action-icon">🗑</span>
              <span className="action-label">Löschen</span>
            </button>
          </nav>
        </div>
      </div>

      {sheet === 'categories' && (
        <CategorySheet
          categories={categories}
          initialSelected={post.categories}
          suggested={post.suggestion?.category}
          onCreateCategory={actions.createCategory}
          onClose={() => setSheet(null)}
          onSave={(selected) => {
            setSheet(null);
            actions.updateMeta(post, { categories: selected });
          }}
        />
      )}

      {sheet === 'notes' && (
        <BottomSheet
          title="Notiz"
          onClose={() => setSheet(null)}
          footer={
            <>
              <button className="btn" onClick={() => setSheet(null)}>Abbrechen</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setSheet(null);
                  if (noteDraft !== post.notes) actions.updateMeta(post, { notes: noteDraft });
                }}
              >
                Speichern
              </button>
            </>
          }
        >
          <textarea
            className="text-input detail-note-input"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="z. B. schon ausprobiert, Abwandlung, für wen …"
            rows={5}
            autoFocus
          />
        </BottomSheet>
      )}

      {showPrint && <PrintView post={post} onClose={() => setShowPrint(false)} />}
    </div>
  );
};

export default PostDetailModal;
