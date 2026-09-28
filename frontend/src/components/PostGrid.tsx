import { useEffect, useRef, useState } from 'react';
import type { Post, ViewMode } from '../types';
import PostCard from './PostCard';
import './PostGrid.css';

const PAGE_SIZE = 60;

interface PostGridProps {
  posts: Post[];
  viewMode: ViewMode;
  onOpen: (postId: string) => void;
}

/**
 * Renders posts in chunks of 60; the next chunk is added when the sentinel below the grid
 * comes near the viewport. Give it a new `key` on filter changes to start over at 60.
 */
const PostGrid = ({ posts, viewMode, onOpen }: PostGridProps) => {
  const [count, setCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const hasMore = count < posts.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) setCount(c => c + PAGE_SIZE);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, count]);

  return (
    <>
      <div className={viewMode === 'list' ? 'post-list' : 'post-grid'}>
        {posts.slice(0, count).map(post => (
          <PostCard key={post.id} post={post} viewMode={viewMode} onOpen={onOpen} />
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} className="grid-sentinel" aria-hidden="true" />}
    </>
  );
};

export default PostGrid;
