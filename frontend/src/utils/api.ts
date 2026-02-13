import { API_URL } from '../config';

const STORAGE_KEY = 'api-secret';

// --- Account management ---

let currentAccount = '';

export function setCurrentAccount(account: string): void {
  currentAccount = account;
}

export function getCurrentAccount(): string {
  return currentAccount;
}

// --- Secret management ---

export function getApiSecret(): string {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setApiSecret(secret: string): void {
  localStorage.setItem(STORAGE_KEY, secret);
}

export function clearApiSecret(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasApiSecret(): boolean {
  return !!localStorage.getItem(STORAGE_KEY);
}

// --- Fetch wrapper ---

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const secret = getApiSecret();
  const headers = new Headers(options.headers);

  if (secret) {
    headers.set('Authorization', `Bearer ${secret}`);
  }

  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const separator = path.includes('?') ? '&' : '?';
  const url = currentAccount
    ? `${API_URL}${path}${separator}account=${encodeURIComponent(currentAccount)}`
    : `${API_URL}${path}`;

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearApiSecret();
    throw new UnauthorizedError();
  }

  return response;
}
