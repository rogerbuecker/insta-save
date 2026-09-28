import { API_URL } from '../config';
import type { Post } from '../types';

/**
 * Resolve a media URL — if it's already absolute (http), return as-is.
 * Otherwise prefix with the API base URL (local dev) or leave relative (production).
 */
export function getMediaUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_URL}${url}`;
}

/** Full-size still image of a post (carousels have no top-level displayUrl). */
export function postImageUrl(post: Post): string {
  return getMediaUrl(post.displayUrl || post.carouselItems[0]?.displayUrl || '');
}

/** Small WebP thumbnail for grids/lists; falls back to the original image. */
export function postThumbUrl(post: Post): string {
  return getMediaUrl(post.thumbUrl) || postImageUrl(post);
}

/** Parse a timestamp ID (e.g. "2024-01-01_07-51-26_UTC") into a Date. */
function parseTimestamp(timestamp: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/.exec(timestamp);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

/** German date for a post timestamp, e.g. "25. Juni 2019". */
export function formatDate(timestamp: string): string {
  const date = parseTimestamp(timestamp);
  if (!date) return timestamp;
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Short German date-time for ISO strings (trash, scraper). */
export function formatDateTime(value?: string | null): string {
  if (!value) return '–';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

/** Does the post look like a recipe (for the print view)? */
export function isRecipePost(post: Post): boolean {
  return post.categories.some(c => /rezept|recipe/i.test(c)) || Boolean(post.recipe?.path);
}
