// localStorage can be missing or throw (private mode, blocked site data) — every access is guarded,
// the app keeps working with in-memory state only.

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function storageAvailable(): boolean {
  const probe = '__insta_probe__';
  if (!storageSet(probe, '1')) return false;
  storageRemove(probe);
  return true;
}
