import { useCallback, useState } from 'react';
import { storageGet, storageSet } from '../utils/storage';

/**
 * State persisted in localStorage. Storage errors are swallowed: without storage the value
 * simply lives in memory for this session.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    const item = storageGet(key);
    if (item === null) return initialValue;
    try {
      return JSON.parse(item) as T;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    setStoredValue(value);
    storageSet(key, JSON.stringify(value));
  }, [key]);

  return [storedValue, setValue];
}
