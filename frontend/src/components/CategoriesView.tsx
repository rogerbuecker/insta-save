import { useMemo, useState } from 'react';
import type { Collection, Post } from '../types';
import { postThumbUrl } from '../utils/media';
import './CategoriesView.css';

interface CategoriesViewProps {
  posts: Post[];
  categories: string[];
  onSelect: (collection: Collection) => void;
  onCategorize: () => void;
  onCreateCategory: (name: string) => Promise<boolean>;
  onDeleteCategory: (name: string) => Promise<boolean>;
}

interface Tile {
  key: Collection;
  label: string;
  count: number;
  cover?: Post;
}

/** Tile overview: one tile per category (cover = newest post) plus favourites and uncategorised.
 *  "Bearbeiten" switches to manage mode: add new categories, delete existing ones. The list is
 *  also what Jev (categorize.py) chooses from on its next run. */
const CategoriesView = ({ posts, categories, onSelect, onCategorize, onCreateCategory, onDeleteCategory }: CategoriesViewProps) => {
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { tiles, uncategorized } = useMemo(() => {
    const byCat = new Map<string, Post[]>();
    for (const cat of categories) byCat.set(cat, []);
    const none: Post[] = [];
    const favorites: Post[] = [];
    for (const post of posts) {
      if (post.favorite) favorites.push(post);
      if (post.categories.length === 0) none.push(post);
      for (const cat of post.categories) {
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat)!.push(post);
      }
    }
    const newest = (list: Post[]) => list.reduce<Post | undefined>(
      (best, p) => (!best || p.timestamp > best.timestamp ? p : best), undefined);

    const result: Tile[] = [...byCat.entries()]
      .map(([cat, list]) => ({ key: `cat:${cat}` as Collection, label: cat, count: list.length, cover: newest(list) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de'));
    if (favorites.length) result.unshift({ key: 'favorite', label: '⭐ Favoriten', count: favorites.length, cover: newest(favorites) });
    if (none.length) result.push({ key: 'none', label: 'Ohne Kategorie', count: none.length, cover: newest(none) });
    return { tiles: result, uncategorized: none.length };
  }, [posts, categories]);

  const create = async () => {
    const name = newName.trim();
    if (name.length < 2 || name.length > 50) {
      setError('Name muss 2–50 Zeichen lang sein');
      return;
    }
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) {
      setError('Gibt es schon');
      return;
    }
    setBusy(true);
    const ok = await onCreateCategory(name);
    setBusy(false);
    if (!ok) {
      setError('Kategorie konnte nicht angelegt werden');
      return;
    }
    setNewName('');
  };

  const remove = async (name: string, count: number) => {
    const hint = count ? `\n${count} ${count === 1 ? 'Beitrag verliert' : 'Beiträge verlieren'} die Zuordnung (die Beiträge selbst bleiben).` : '';
    if (!window.confirm(`Kategorie „${name}" löschen?${hint}`)) return;
    setBusy(true);
    await onDeleteCategory(name);
    setBusy(false);
  };

  return (
    <div className="cat-view">
      {uncategorized > 0 && (
        <button className="cat-categorize" onClick={onCategorize}>
          <span>📋 {uncategorized} Beiträge ohne Kategorie durchgehen</span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      <div className="cat-toolbar">
        <button className="btn" onClick={() => { setEditing(e => !e); setError(''); }}>
          {editing ? 'Fertig' : '✏️ Bearbeiten'}
        </button>
      </div>
      {editing && (
        <form className="cat-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input
            className="text-input"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError(''); }}
            placeholder="Neue Kategorie"
            maxLength={50}
            enterKeyHint="done"
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()}>Anlegen</button>
        </form>
      )}
      {editing && error && <p className="cat-error">{error}</p>}
      {editing && <p className="cat-hint">Neue Kategorien nutzt Jev beim nächsten Einsortier-Lauf mit.</p>}
      <div className="cat-grid">
        {tiles.map(tile => (
          editing ? (
            tile.key.startsWith('cat:') ? (
              <div key={tile.key} className="cat-tile cat-tile-edit">
                <span className="cat-name">{tile.label}</span>
                <span className="cat-count">{tile.count} {tile.count === 1 ? 'Beitrag' : 'Beiträge'}</span>
                <button
                  className="cat-delete"
                  disabled={busy}
                  onClick={() => remove(tile.label, tile.count)}
                  aria-label={`Kategorie ${tile.label} löschen`}
                >🗑 Löschen</button>
              </div>
            ) : null
          ) : (
          <button key={tile.key} className="cat-tile" onClick={() => onSelect(tile.key)}>
            <span className="cat-cover">
              {tile.cover && <img src={postThumbUrl(tile.cover)} alt="" loading="lazy" decoding="async" />}
            </span>
            <span className="cat-name">{tile.label}</span>
            <span className="cat-count">{tile.count} {tile.count === 1 ? 'Beitrag' : 'Beiträge'}</span>
          </button>
          )
        ))}
      </div>
    </div>
  );
};

export default CategoriesView;
