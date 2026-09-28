import { useEffect, useState } from 'react';
import type { Post, DuplicateMatch } from '../types';
import { apiFetch } from '../utils/api';
import { postThumbUrl } from '../utils/media';
import { useOverlay } from '../hooks/useOverlay';
import './DuplicateDetection.css';

interface DuplicateDetectionProps {
  posts: Post[];
  onClose: () => void;
  /** Posts were merged/deleted — reload them */
  onChanged: () => void;
}

const DuplicatePost = ({ post, side }: { post: Post; side: string }) => (
  <div className="duplicate-post">
    <div className="duplicate-media">
      <img src={postThumbUrl(post)} alt="" className="duplicate-image" loading="lazy" decoding="async" />
      <span className="duplicate-side">{side}</span>
    </div>
    <div className="duplicate-info">
      <div className="duplicate-owner">@{post.owner}</div>
      <div className="duplicate-caption">{post.caption.substring(0, 100)}{post.caption.length > 100 && '…'}</div>
      <div className="duplicate-meta">
        {post.categories.length > 0 && <span className="duplicate-categories">{post.categories.join(', ')}</span>}
        {post.notes && <span className="duplicate-notes">mit Notiz</span>}
      </div>
    </div>
  </div>
);

/** Find exact/similar duplicates and merge or delete them (deleted posts go to the trash). */
const DuplicateDetection = ({ posts, onClose, onChanged }: DuplicateDetectionProps) => {
  useOverlay(true, onClose);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/duplicates')
      .then(res => (res.ok ? res.json() : []))
      .then((data: DuplicateMatch[]) => { if (alive) setDuplicates(data); })
      .catch(() => { if (alive) setDuplicates([]); });
    return () => { alive = false; };
  }, [reloadKey]);

  const run = async (request: () => Promise<Response>) => {
    setProcessing(true);
    try {
      const res = await request();
      if (res.ok) {
        onChanged();
        setReloadKey(k => k + 1);
      }
    } catch (error) {
      console.error('Duplicate action failed:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleAutoClean = () => {
    if (!window.confirm('Alle exakten Duplikate aufräumen? Die erste Kopie bleibt, die zweite kommt in den Papierkorb.')) return;
    run(() => apiFetch('/api/duplicates/auto-clean', { method: 'POST' }));
  };

  const handleMerge = (keepId: string, deleteId: string) =>
    run(() => apiFetch('/api/duplicates/merge', { method: 'POST', body: JSON.stringify({ keepId, deleteId }) }));

  const handleDelete = (postId: string) => {
    if (!window.confirm('Diesen Beitrag löschen? (Er landet im Papierkorb.)')) return;
    run(() => apiFetch(`/api/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' }));
  };

  const handleKeepBoth = (match: DuplicateMatch) => {
    setDuplicates(prev => prev?.filter(d => !(d.postIds[0] === match.postIds[0] && d.postIds[1] === match.postIds[1])) ?? null);
  };

  const byId = new Map(posts.map(p => [p.id, p]));
  const list = duplicates ?? [];
  const exact = list.filter(d => d.matchType === 'exact');

  return (
    <div className="duplicate-detection-overlay" onClick={onClose}>
      <div className="duplicate-detection-modal" role="dialog" aria-modal="true" aria-label="Duplikate" onClick={(e) => e.stopPropagation()}>
        <div className="duplicate-header">
          <div>
            <h2>Duplikate</h2>
            {duplicates && (
              <div className="duplicate-stats">
                {list.length} gefunden{exact.length > 0 && ` (${exact.length} exakt, ${list.length - exact.length} ähnlich)`}
              </div>
            )}
          </div>
          <button onClick={onClose} className="icon-btn" aria-label="Schließen">✕</button>
        </div>

        <div className="duplicate-body">
          {!duplicates ? (
            <div className="loading-message">Prüfe {posts.length} Beiträge …</div>
          ) : list.length === 0 ? (
            <div className="no-duplicates">
              <h3>Keine Duplikate gefunden</h3>
              <p>Alle Beiträge scheinen einzigartig zu sein.</p>
              <button onClick={onClose} className="btn btn-primary">Schließen</button>
            </div>
          ) : (
            <>
              {exact.length > 0 && (
                <div className="auto-clean-section">
                  <button onClick={handleAutoClean} className="btn btn-primary" disabled={processing}>
                    {exact.length} exakte Duplikate aufräumen
                  </button>
                  <p className="auto-clean-note">Behält jeweils die erste Kopie, die zweite kommt in den Papierkorb.</p>
                </div>
              )}

              <div className="duplicates-list">
                {list.map(match => {
                  const left = byId.get(match.postIds[0]);
                  const right = byId.get(match.postIds[1]);
                  if (!left || !right) return null;
                  return (
                    <div key={match.postIds.join('|')} className="duplicate-pair">
                      <div className="duplicate-pair-header">
                        <span className={`match-badge ${match.matchType}`}>
                          {match.matchScore}% {match.matchType === 'exact' ? 'exakt' : 'ähnlich'}
                        </span>
                        <span className="match-reason">{match.reason}</span>
                      </div>
                      <div className="duplicate-posts">
                        <DuplicatePost post={left} side="Links" />
                        <div className="duplicate-divider">vs</div>
                        <DuplicatePost post={right} side="Rechts" />
                      </div>
                      <div className="duplicate-actions">
                        <button onClick={() => handleMerge(left.id, right.id)} className="btn" disabled={processing}
                          title="Kategorien und Notizen zusammenführen, linken Beitrag behalten">
                          Zusammenführen
                        </button>
                        <button onClick={() => handleDelete(left.id)} className="btn btn-danger" disabled={processing}>Links löschen</button>
                        <button onClick={() => handleDelete(right.id)} className="btn btn-danger" disabled={processing}>Rechts löschen</button>
                        <button onClick={() => handleKeepBoth(match)} className="btn" disabled={processing}>Beide behalten</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DuplicateDetection;
