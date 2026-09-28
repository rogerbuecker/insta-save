import { useEffect, useState } from 'react';
import type { TrashItem } from '../types';
import { apiFetch } from '../utils/api';
import { formatDateTime, getMediaUrl } from '../utils/media';
import './TrashView.css';

interface TrashViewProps {
  /** Called after a successful restore so the app can reload its posts */
  onRestored: () => void;
  showToast: (message: string) => void;
}

/** Deleted posts of the current account (kept 30 days) with "Wiederherstellen". */
const TrashView = ({ onRestored, showToast }: TrashViewProps) => {
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/trash')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: TrashItem[]) => { if (alive) setItems(data); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const restore = async (item: TrashItem) => {
    setBusy(item.trashId);
    try {
      const res = await apiFetch(`/api/posts/${encodeURIComponent(item.id)}/restore`, { method: 'POST' });
      if (res.status === 409) {
        showToast('Beitrag ist schon wieder da');
      } else if (!res.ok) {
        throw new Error(String(res.status));
      } else {
        showToast('Wiederhergestellt');
      }
      setItems(prev => prev?.filter(i => i.trashId !== item.trashId) ?? null);
      onRestored();
    } catch {
      showToast('Wiederherstellen fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  };

  if (failed) return <p className="trash-muted">Papierkorb konnte nicht geladen werden.</p>;
  if (!items) return <p className="trash-muted">Lade Papierkorb …</p>;
  if (items.length === 0) return <p className="trash-muted">Der Papierkorb ist leer.</p>;

  return (
    <div className="trash">
      <p className="trash-muted">Gelöschte Beiträge bleiben 30 Tage hier und werden dann endgültig entfernt.</p>
      {items.map(item => (
        <div key={item.trashId} className="trash-item">
          <span className="trash-thumb">
            {item.thumbUrl && <img src={getMediaUrl(item.thumbUrl)} alt="" loading="lazy" decoding="async" />}
          </span>
          <span className="trash-text">
            <span className="trash-owner">@{item.owner || 'unbekannt'}</span>
            <span className="trash-caption">{item.caption || 'Ohne Beschreibung'}</span>
            <span className="trash-date">Gelöscht {formatDateTime(item.deletedAt)}</span>
          </span>
          <button className="btn" onClick={() => restore(item)} disabled={busy !== null}>
            {busy === item.trashId ? '…' : 'Wiederherstellen'}
          </button>
        </div>
      ))}
    </div>
  );
};

export default TrashView;
