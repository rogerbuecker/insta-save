import React, { useState, useEffect } from 'react';
import type { Post, DuplicateMatch } from '../types';
import { apiFetch } from '../utils/api';
import { getMediaUrl } from '../utils/media';
import './DuplicateDetection.css';

interface DuplicateDetectionProps {
  posts: Post[];
  onClose: () => void;
  onPostDelete: (postId: string) => void;
  onPostUpdate: (postId: string, updates: Partial<Post>) => void;
}

const DuplicateDetection: React.FC<DuplicateDetectionProps> = ({
  posts,
  onClose,
  onPostDelete,
  onPostUpdate,
}) => {
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const fetchDuplicates = async () => {
    try {
      setLoading(true);
      const response = await apiFetch('/api/duplicates');
      if (response.ok) {
        const data = await response.json();
        setDuplicates(data);
      }
    } catch (error) {
      console.error('Error fetching duplicates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoClean = async () => {
    if (!window.confirm('Auto-delete all exact duplicates? This will keep the first copy and delete the second.')) {
      return;
    }

    try {
      setProcessing(true);
      const response = await apiFetch('/api/duplicates/auto-clean', {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        result.deletedIds.forEach((id: string) => onPostDelete(id));
        await fetchDuplicates();
      }
    } catch (error) {
      console.error('Error auto-cleaning duplicates:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleMerge = async (keepId: string, deleteId: string) => {
    try {
      setProcessing(true);
      const response = await apiFetch('/api/duplicates/merge', {
        method: 'POST',
        body: JSON.stringify({ keepId, deleteId }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Fetch the updated post data
          const postResponse = await apiFetch(`/api/posts/${keepId}`);
          if (postResponse.ok) {
            const updatedPost = await postResponse.json();
            onPostUpdate(keepId, updatedPost);
          }
          onPostDelete(deleteId);
          await fetchDuplicates();
        }
      }
    } catch (error) {
      console.error('Error merging duplicates:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteOne = async (postId: string) => {
    if (!window.confirm('Delete this post?')) {
      return;
    }

    try {
      setProcessing(true);
      const response = await apiFetch(`/api/posts/${postId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onPostDelete(postId);
        await fetchDuplicates();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleKeepBoth = (match: DuplicateMatch) => {
    // Remove this match from the duplicates list
    setDuplicates(prev => prev.filter(d =>
      !(d.postIds[0] === match.postIds[0] && d.postIds[1] === match.postIds[1])
    ));
  };

  const getPostById = (id: string): Post | undefined => {
    return posts.find(p => p.id === id);
  };

  const exactDuplicates = duplicates.filter(d => d.matchType === 'exact');
  const similarDuplicates = duplicates.filter(d => d.matchType === 'similar');

  if (loading) {
    return (
      <div className="duplicate-detection-overlay" onClick={onClose}>
        <div className="duplicate-detection-modal" onClick={(e) => e.stopPropagation()}>
          <div className="duplicate-header">
            <h2>Finding Duplicates...</h2>
            <button onClick={onClose} className="close-btn">×</button>
          </div>
          <div className="duplicate-body">
            <div className="loading-message">Analyzing {posts.length} posts...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="duplicate-detection-overlay" onClick={onClose}>
      <div className="duplicate-detection-modal" onClick={(e) => e.stopPropagation()}>
        <div className="duplicate-header">
          <div>
            <h2>Duplicate Detection</h2>
            <div className="duplicate-stats">
              Found <strong>{duplicates.length}</strong> duplicate{duplicates.length !== 1 ? 's' : ''}
              {exactDuplicates.length > 0 && (
                <> (<strong>{exactDuplicates.length}</strong> exact, <strong>{similarDuplicates.length}</strong> similar)</>
              )}
            </div>
          </div>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="duplicate-body">
          {duplicates.length === 0 ? (
            <div className="no-duplicates">
              <h3>No Duplicates Found</h3>
              <p>All your posts appear to be unique.</p>
              <button onClick={onClose} className="done-btn">Close</button>
            </div>
          ) : (
            <>
              {exactDuplicates.length > 0 && (
                <div className="auto-clean-section">
                  <button
                    onClick={handleAutoClean}
                    className="auto-clean-btn"
                    disabled={processing}
                  >
                    Auto-Clean {exactDuplicates.length} Exact Duplicate{exactDuplicates.length !== 1 ? 's' : ''}
                  </button>
                  <p className="auto-clean-note">
                    This will automatically keep the first copy and delete the second for all exact matches.
                  </p>
                </div>
              )}

              <div className="duplicates-list">
                {duplicates.map((match, idx) => {
                  const post1 = getPostById(match.postIds[0]);
                  const post2 = getPostById(match.postIds[1]);

                  if (!post1 || !post2) return null;

                  return (
                    <div key={idx} className="duplicate-pair">
                      <div className="duplicate-pair-header">
                        <span className={`match-badge ${match.matchType}`}>
                          {match.matchScore}% {match.matchType}
                        </span>
                        <span className="match-reason">{match.reason}</span>
                      </div>

                      <div className="duplicate-posts">
                        <div className="duplicate-post">
                          <div className="duplicate-media">
                            {post1.isVideo ? (
                              <video
                                src={getMediaUrl(post1.videoUrl)}
                                poster={getMediaUrl(post1.displayUrl)}
                                className="duplicate-image"
                              />
                            ) : (
                              <img
                                src={getMediaUrl(post1.displayUrl)}
                                alt={post1.caption}
                                className="duplicate-image"
                              />
                            )}
                          </div>
                          <div className="duplicate-info">
                            <div className="duplicate-owner">@{post1.owner}</div>
                            <div className="duplicate-caption">
                              {post1.caption.substring(0, 100)}
                              {post1.caption.length > 100 && '...'}
                            </div>
                            <div className="duplicate-meta">
                              {post1.categories.length > 0 && (
                                <span className="duplicate-categories">
                                  {post1.categories.join(', ')}
                                </span>
                              )}
                              {post1.notes && (
                                <span className="duplicate-notes">Has notes</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="duplicate-divider">vs</div>

                        <div className="duplicate-post">
                          <div className="duplicate-media">
                            {post2.isVideo ? (
                              <video
                                src={getMediaUrl(post2.videoUrl)}
                                poster={getMediaUrl(post2.displayUrl)}
                                className="duplicate-image"
                              />
                            ) : (
                              <img
                                src={getMediaUrl(post2.displayUrl)}
                                alt={post2.caption}
                                className="duplicate-image"
                              />
                            )}
                          </div>
                          <div className="duplicate-info">
                            <div className="duplicate-owner">@{post2.owner}</div>
                            <div className="duplicate-caption">
                              {post2.caption.substring(0, 100)}
                              {post2.caption.length > 100 && '...'}
                            </div>
                            <div className="duplicate-meta">
                              {post2.categories.length > 0 && (
                                <span className="duplicate-categories">
                                  {post2.categories.join(', ')}
                                </span>
                              )}
                              {post2.notes && (
                                <span className="duplicate-notes">Has notes</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="duplicate-actions">
                        <button
                          onClick={() => handleMerge(match.postIds[0], match.postIds[1])}
                          className="action-btn merge-btn"
                          disabled={processing}
                          title="Combine categories and notes from both posts, keep first post"
                        >
                          Merge & Delete Right
                        </button>
                        <button
                          onClick={() => handleDeleteOne(match.postIds[0])}
                          className="action-btn delete-btn"
                          disabled={processing}
                        >
                          Delete Left
                        </button>
                        <button
                          onClick={() => handleDeleteOne(match.postIds[1])}
                          className="action-btn delete-btn"
                          disabled={processing}
                        >
                          Delete Right
                        </button>
                        <button
                          onClick={() => handleKeepBoth(match)}
                          className="action-btn keep-btn"
                          disabled={processing}
                        >
                          Keep Both
                        </button>
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
