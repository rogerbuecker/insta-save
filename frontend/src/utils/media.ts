import { API_URL } from '../config';

/**
 * Resolve a media URL — if it's already absolute (http), return as-is.
 * Otherwise prefix with the API base URL (local dev) or leave relative (production).
 */
export function getMediaUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_URL}${url}`;
}

/**
 * Format a timestamp ID (e.g. "2024-01-01_07-51-26_UTC") into a readable date string.
 */
export function formatDate(timestamp: string): string {
  const parts = timestamp.split('_');
  if (parts.length >= 2) {
    const date = parts[0];
    const time = parts[1].replace(/-/g, ':');
    return `${date} ${time}`;
  }
  return timestamp;
}
