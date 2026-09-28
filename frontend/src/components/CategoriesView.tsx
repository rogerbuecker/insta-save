import { useMemo } from 'react';
import type { Collection, Post } from '../types';
import { postThumbUrl } from '../utils/media';
import './CategoriesView.css';

interface CategoriesViewProps {
  posts: Post[];
  categories: string[];
  onSelect: (collection: Collection) => void;
  onCategorize: () => void;
}

interface Tile {
  key: Collection;
  label: string;
  count: number;
  cover?: Post;
}

/** Tile overview: one tile per category (cover = newest post) plus favourites and uncategorised. */
const CategoriesView = ({ posts, categories, onSelect, onCategorize }: CategoriesViewProps) => {
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

  return (
    <div className="cat-view">
      {uncategorized > 0 && (
        <button className="cat-categorize" onClick={onCategorize}>
          <span>📋 {uncategorized} Beiträge ohne Kategorie durchgehen</span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      <div className="cat-grid">
        {tiles.map(tile => (
          <button key={tile.key} className="cat-tile" onClick={() => onSelect(tile.key)}>
            <span className="cat-cover">
              {tile.cover && <img src={postThumbUrl(tile.cover)} alt="" loading="lazy" decoding="async" />}
            </span>
            <span className="cat-name">{tile.label}</span>
            <span className="cat-count">{tile.count} {tile.count === 1 ? 'Beitrag' : 'Beiträge'}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CategoriesView;
