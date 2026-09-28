import { useMemo, useRef, useState } from 'react';
import type { Post, PostActions } from '../types';
import CategorySheet from './CategorySheet';
import { postImageUrl, postThumbUrl } from '../utils/media';
import './SuggestionsView.css';

interface SuggestionsViewProps {
  posts: Post[];
  categories: string[];
  actions: PostActions;
  onOpenPost: (postId: string) => void;
}

const SWIPE_THRESHOLD = 100;

/**
 * Card stack for open Jev category suggestions: swipe right / "✓ Passt" accepts,
 * swipe left / "Andere…" opens the category sheet, "Überspringen" moves on for this session.
 */
const SuggestionsView = ({ posts, categories, actions, onOpenPost }: SuggestionsViewProps) => {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [handled, setHandled] = useState(0);
  const [choosing, setChoosing] = useState<Post | null>(null);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<'left' | 'right' | null>(null);
  const drag = useRef<{ x: number; y: number; id: number; axis: 'x' | 'y' | null } | null>(null);

  const open = useMemo(() => posts.filter(p => p.suggestion), [posts]);
  const queue = useMemo(() => open.filter(p => !skipped.includes(p.id)), [open, skipped]);
  const current = queue[0];
  const next = queue[1];
  // Skipped posts stay open (they are part of `open`), handled ones dropped out of it
  const total = handled + open.length;
  const position = handled + skipped.length + 1;

  const accept = (post: Post) => {
    setLeaving('right');
    window.setTimeout(() => {
      setLeaving(null);
      setDx(0);
      setHandled(h => h + 1);
      actions.acceptSuggestion(post);
    }, 180);
  };

  const skip = (post: Post) => {
    setSkipped(prev => [...prev, post.id]);
    setDx(0);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, axis: null };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (d.axis === null) {
      if (Math.hypot(mx, my) < 10) return;
      d.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (d.axis === 'x') (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (d.axis === 'x') setDx(mx);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== 'x' || !current) {
      setDx(0);
      return;
    }
    if (dx > SWIPE_THRESHOLD) {
      accept(current);
    } else if (dx < -SWIPE_THRESHOLD) {
      setDx(0);
      setChoosing(current);
    } else {
      setDx(0);
    }
  };

  if (!current) {
    return (
      <div className="suggest-empty">
        <div className="suggest-empty-icon">🎉</div>
        <h2>Alles erledigt</h2>
        <p>
          {skipped.length > 0
            ? `Keine weiteren Vorschläge. ${skipped.length} übersprungen.`
            : 'Gerade gibt es keine offenen Kategorie-Vorschläge.'}
        </p>
        {skipped.length > 0 && (
          <button className="btn btn-primary" onClick={() => setSkipped([])}>Übersprungene nochmal ansehen</button>
        )}
      </div>
    );
  }

  const rotation = dx / 18;
  const cardStyle = leaving
    ? undefined
    : { transform: `translateX(${dx}px) rotate(${rotation}deg)`, transition: dx ? 'none' : undefined };

  return (
    <div className="suggest">
      <div className="suggest-progress">
        <span>{Math.min(position, total)} von {total}</span>
        <div className="suggest-bar"><div style={{ width: `${Math.min(100, ((position - 1) / Math.max(1, total)) * 100)}%` }} /></div>
      </div>

      <div className="suggest-stack">
        {next && (
          <div className="suggest-card suggest-card-next" aria-hidden="true">
            <div className="suggest-media" style={{ backgroundImage: `url("${postThumbUrl(next)}")` }} />
          </div>
        )}
        <div
          key={current.id}
          className={`suggest-card ${leaving ? `leave-${leaving}` : ''}`}
          style={cardStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <button className="suggest-media-btn" onClick={() => onOpenPost(current.id)} aria-label="Beitrag groß ansehen">
            <div className="suggest-media" style={{ backgroundImage: `url("${postThumbUrl(current)}")` }}>
              {postImageUrl(current) && <img src={postImageUrl(current)} alt="" draggable={false} />}
            </div>
          </button>
          <div className="suggest-stamp suggest-stamp-yes" style={{ opacity: Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD)) }}>Passt</div>
          <div className="suggest-stamp suggest-stamp-no" style={{ opacity: Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD)) }}>Andere</div>
          <div className="suggest-body">
            <div className="suggest-owner">@{current.owner}</div>
            {current.caption && <p className="suggest-caption">{current.caption}</p>}
            <div className="suggest-label">
              Vorschlag: <strong>{current.suggestion?.category}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="suggest-actions">
        <button className="btn" onClick={() => setChoosing(current)}>Andere…</button>
        <button className="btn" onClick={() => skip(current)}>Überspringen</button>
        <button className="btn btn-primary" onClick={() => accept(current)}>✓ Passt</button>
      </div>
      <p className="suggest-hint">Tipp: nach rechts wischen = passt, nach links = andere Kategorie</p>

      {choosing && (
        <CategorySheet
          title="Welche Kategorie passt?"
          categories={categories}
          initialSelected={[]}
          suggested={choosing.suggestion?.category}
          onCreateCategory={actions.createCategory}
          onClose={() => setChoosing(null)}
          onSave={(selected) => {
            const post = choosing;
            setChoosing(null);
            if (selected.length === 0) return;
            setHandled(h => h + 1);
            actions.replaceSuggestion(post, selected);
          }}
        />
      )}
    </div>
  );
};

export default SuggestionsView;
