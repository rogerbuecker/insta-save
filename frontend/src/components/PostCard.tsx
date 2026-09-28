import { memo } from 'react';
import type { Post, ViewMode } from '../types';
import { postThumbUrl, formatDate } from '../utils/media';
import './PostCard.css';

interface PostCardProps {
  post: Post;
  viewMode: ViewMode;
  onOpen: (postId: string) => void;
}

const CarouselIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M8 3h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-5 5h1.5v11A1.5 1.5 0 0 0 6 20.5h11V22H6a3 3 0 0 1-3-3Z" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="currentColor" d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />
  </svg>
);

/** Grid tile (thumbnail only, lazy) or compact list row. Opens the detail view on tap. */
const PostCard = ({ post, viewMode, onOpen }: PostCardProps) => {
  const thumb = postThumbUrl(post);
  const label = `Beitrag von @${post.owner}${post.caption ? `: ${post.caption.slice(0, 80)}` : ''}`;

  const badges = (
    <>
      {post.isCarousel && <span className="tile-badge tile-badge-tr" title="Karussell"><CarouselIcon /></span>}
      {post.isVideo && !post.isCarousel && <span className="tile-badge tile-badge-tr" title="Video"><PlayIcon /></span>}
      {(post.favorite || post.tried) && (
        <span className="tile-status">
          {post.favorite && <span className="tile-fav" title="Favorit">★</span>}
          {post.tried && <span className="tile-tried" title="Ausprobiert">✓</span>}
        </span>
      )}
    </>
  );

  if (viewMode === 'list') {
    return (
      <button className="post-row" onClick={() => onOpen(post.id)} aria-label={label}>
        <span className="post-row-thumb">
          {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" />}
          {badges}
        </span>
        <span className="post-row-text">
          <span className="post-row-meta">@{post.owner} · {formatDate(post.timestamp)}</span>
          <span className="post-row-caption">{post.caption || 'Ohne Beschreibung'}</span>
          {post.categories.length > 0 && (
            <span className="post-row-cats">{post.categories.join(' · ')}</span>
          )}
        </span>
      </button>
    );
  }

  return (
    <button className="post-tile" onClick={() => onOpen(post.id)} aria-label={label}>
      {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" />}
      {badges}
    </button>
  );
};

export default memo(PostCard);
