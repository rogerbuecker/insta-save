import React, { useMemo } from 'react';
import type { Post, SmartCollection } from '../types';
import './SmartCollections.css';

interface SmartCollectionsProps {
  posts: Post[];
  onSelectHashtag: (hashtag: string) => void;
  selectedHashtag: string;
}

const SmartCollections: React.FC<SmartCollectionsProps> = ({
  posts,
  onSelectHashtag,
  selectedHashtag,
}) => {
  const collections = useMemo((): SmartCollection[] => {
    // Count hashtags across all posts
    const hashtagCounts = new Map<string, number>();

    posts.forEach(post => {
      post.hashtags.forEach(tag => {
        hashtagCounts.set(tag, (hashtagCounts.get(tag) || 0) + 1);
      });
    });

    // Filter hashtags with minimum 3 posts and create collections
    const collections: SmartCollection[] = [];
    hashtagCounts.forEach((count, hashtag) => {
      if (count >= 3) {
        collections.push({
          id: `hashtag-${hashtag}`,
          type: 'hashtag',
          name: hashtag,
          hashtag: hashtag,
          count: count
        });
      }
    });

    // Sort by count descending and take top 10
    return collections
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [posts]);

  if (collections.length === 0) {
    return null;
  }

  return (
    <div className="smart-collections">
      <div className="collections-header">
        <h3>📌 Top Hashtags</h3>
        {selectedHashtag && (
          <button
            onClick={() => onSelectHashtag('')}
            className="clear-collection-btn"
            title="Clear filter"
          >
            ✕ Clear
          </button>
        )}
      </div>

      <div className="collections-list">
        {collections.map(collection => (
          <button
            key={collection.id}
            onClick={() => onSelectHashtag(
              selectedHashtag === collection.hashtag ? '' : collection.hashtag
            )}
            className={`collection-item ${selectedHashtag === collection.hashtag ? 'active' : ''}`}
          >
            <span className="collection-icon">#</span>
            <span className="collection-name">
              {collection.name.replace('#', '')}
            </span>
            <span className="collection-count">{collection.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SmartCollections;
