import { useState } from 'react';
import type { Post } from '../types';
import { useOverlay } from '../hooks/useOverlay';
import { postImageUrl } from '../utils/media';
import './CategorizationModal.css';

interface CategorizationModalProps {
  posts: Post[];
  availableCategories: string[];
  onClose: () => void;
  onSave: (post: Post, categories: string[], notes: string) => void;
  onCreateCategory: (name: string) => Promise<boolean>;
}

/** Walk through all posts without category one by one (categories + note). */
const CategorizationModal = ({ posts, availableCategories, onClose, onSave, onCreateCategory }: CategorizationModalProps) => {
  useOverlay(true, onClose);
  // Snapshot: saved posts drop out of "uncategorised" but must keep their place in the walk
  const [queue] = useState(() => posts.filter(p => p.categories.length === 0).map(p => p.id));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [newName, setNewName] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const post = posts.find(p => p.id === queue[index]);
  const done = index >= queue.length;

  // Load the current post's values when moving to it (state reset during render, no effect needed)
  if (post && loadedId !== post.id) {
    setLoadedId(post.id);
    setSelected(post.categories.length ? post.categories : post.suggestion ? [post.suggestion.category] : []);
    setNotes(post.notes);
  }

  const toggle = (cat: string) => setSelected(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const go = (dir: 1 | -1) => setIndex(i => Math.max(0, Math.min(queue.length, i + dir)));

  const save = () => {
    if (!post) return;
    if (selected.length || notes !== post.notes) onSave(post, selected, notes);
    go(1);
  };

  const create = async () => {
    const name = newName.trim();
    if (name.length < 2) return;
    const existing = availableCategories.find(c => c.toLowerCase() === name.toLowerCase());
    if (existing || await onCreateCategory(name)) {
      const cat = existing ?? name;
      setSelected(prev => prev.includes(cat) ? prev : [...prev, cat]);
      setNewName('');
    }
  };

  return (
    <div className="categorize-overlay" onClick={onClose}>
      <div className="categorize" role="dialog" aria-modal="true" aria-label="Kategorisieren" onClick={(e) => e.stopPropagation()}>
        <header className="categorize-head">
          <div>
            <h2>Kategorisieren</h2>
            {!done && <div className="categorize-progress">{index + 1} von {queue.length}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">✕</button>
        </header>

        {done || !post ? (
          <div className="categorize-done">
            <h3>✅ Fertig!</h3>
            <p>{queue.length === 0 ? 'Alle Beiträge haben eine Kategorie.' : 'Du hast alle Beiträge ohne Kategorie durchgesehen.'}</p>
            <button className="btn btn-primary" onClick={onClose}>Schließen</button>
          </div>
        ) : (
          <>
            <div className="categorize-body">
              <div className="categorize-media">
                {postImageUrl(post) && <img src={postImageUrl(post)} alt="" decoding="async" />}
                {post.isVideo && <span className="categorize-video">▶ Video</span>}
              </div>
              <div className="categorize-form">
                <div className="categorize-owner">@{post.owner}</div>
                {post.caption && <p className="categorize-caption">{post.caption}</p>}

                <div className="categorize-label">Kategorien</div>
                <div className="categorize-chips">
                  {availableCategories.map(cat => (
                    <button
                      key={cat}
                      className={`chip ${selected.includes(cat) ? 'active' : ''}`}
                      onClick={() => toggle(cat)}
                      aria-pressed={selected.includes(cat)}
                    >
                      {cat}
                      {post.suggestion?.category === cat && <span className="chip-hint">Vorschlag</span>}
                    </button>
                  ))}
                </div>
                <form className="categorize-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
                  <input
                    className="text-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Neue Kategorie"
                    maxLength={50}
                  />
                  <button type="submit" className="btn" disabled={newName.trim().length < 2}>Anlegen</button>
                </form>

                <div className="categorize-label">Notiz (optional)</div>
                <textarea
                  className="text-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notiz zum Beitrag …"
                  rows={3}
                />
              </div>
            </div>

            <footer className="categorize-foot">
              <button className="btn" onClick={() => go(-1)} disabled={index === 0}>← Zurück</button>
              <button className="btn" onClick={() => go(1)}>Überspringen</button>
              <button className="btn btn-primary" onClick={save}>
                {index < queue.length - 1 ? 'Speichern & weiter' : 'Speichern'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};

export default CategorizationModal;
