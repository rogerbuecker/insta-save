import { API_URL } from '../config';
import { storageGet, storageRemove, storageSet } from './storage';

const STORAGE_KEY = 'api-secret';

// --- Account management ---

let currentAccount = '';

export function setCurrentAccount(account: string): void {
  currentAccount = account;
}

// --- Secret management ---

export function getApiSecret(): string {
  return storageGet(STORAGE_KEY) || '';
}

export function setApiSecret(secret: string): void {
  storageSet(STORAGE_KEY, secret);
}

export function clearApiSecret(): void {
  storageRemove(STORAGE_KEY);
}

export function hasApiSecret(): boolean {
  return !!storageGet(STORAGE_KEY);
}

// --- Fetch wrapper ---

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

/** Fetch an API path; appends ?account=<current account> when one is selected. */
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

/** JSON helper for write calls: throws on non-2xx so callers can roll back optimistic updates. */
export async function apiSend(path: string, method: string, body?: unknown): Promise<Response> {
  const response = await apiFetch(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}
