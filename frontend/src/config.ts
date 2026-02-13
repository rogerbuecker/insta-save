// In local dev (VITE_API_URL=http://localhost:3001), API calls go to Express.
// In production on Cloudflare Pages, API_URL is empty (same-origin Pages Functions).
export const API_URL = import.meta.env.VITE_API_URL || '';
