import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';
import { formatDateTime } from '../utils/media';
import './ScrapePanel.css';

interface AccountStatus {
  posts: number | null;
  blocked_reason: string | null;
  last_run?: string;
  last_result?: string;
  has_session?: boolean;
}

interface ScrapeStatus {
  running: boolean;
  current: { account: string; started: string; new: number } | null;
  accounts: Record<string, AccountStatus>;
}

// Starting runs and importing sessions happens in the Brain UI module (loopback-only API here).
const BRAIN_UI_URL = `${window.location.protocol}//${window.location.hostname}:3090/insta-save`;

/** Read-only scraper status (polls every 10 s while visible). */
const ScrapePanel = () => {
  const [status, setStatus] = useState<ScrapeStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await apiFetch('/api/scrape/status');
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (alive) { setStatus(data); setFailed(false); }
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  return (
    <div className="scrape">
      {failed && <p className="scrape-error">Status konnte nicht geladen werden.</p>}
      {!status && !failed && <p className="scrape-muted">Lade Status …</p>}

      {status?.running && (
        <p className="scrape-running">
          ⏳ Läuft gerade: @{status.current?.account ?? '…'} · {status.current?.new ?? 0} neue Beiträge
        </p>
      )}

      {status && Object.entries(status.accounts).map(([name, acc]) => (
        <div key={name} className="scrape-account">
          <div className="scrape-account-head">
            <strong>@{name}</strong>
            <span>{acc.posts ?? '–'} Beiträge</span>
          </div>
          <div className="scrape-row">
            <span>Letzter Lauf</span>
            <span>{formatDateTime(acc.last_run)}{acc.last_result ? ` (${acc.last_result})` : ''}</span>
          </div>
          <div className="scrape-row">
            <span>Status</span>
            <span className={acc.blocked_reason ? 'scrape-blocked' : 'scrape-ok'}>{acc.blocked_reason ?? 'bereit'}</span>
          </div>
        </div>
      ))}

      <p className="scrape-hint">
        Laden startest du über Brain UI oder den Telegram-Knopf.
      </p>
      <a className="scrape-link" href={BRAIN_UI_URL}>Brain UI öffnen →</a>
    </div>
  );
};

export default ScrapePanel;
