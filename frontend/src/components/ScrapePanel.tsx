import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api';
import './ScrapePanel.css';

interface AccountStatus {
  posts: number | null;
  blocked_reason: string | null;
  last_run?: string;
  last_result?: string;
}

interface ScrapeStatus {
  running: boolean;
  current: { account: string; started: string; new: number } | null;
  accounts: Record<string, AccountStatus>;
}

interface ScrapePanelProps {
  onClose: () => void;
}

// Starting runs and importing sessions happens in the authenticated Brain UI module.
const BRAIN_UI_URL = `${window.location.protocol}//${window.location.hostname}:3090/insta-save`;

function formatTs(value?: string) {
  return value ? new Date(value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';
}

const ScrapePanel = ({ onClose }: ScrapePanelProps) => {
  const [status, setStatus] = useState<ScrapeStatus | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await apiFetch('/api/scrape/status');
      if (res.ok) setStatus(await res.json());
    };
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="scrape-overlay" onClick={onClose}>
      <div className="scrape-panel" onClick={(e) => e.stopPropagation()}>
        <div className="scrape-panel-header">
          <h2>Scraper</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {status?.running && (
          <p className="scrape-running">
            ⏳ Läuft: @{status.current?.account ?? '…'} · {status.current?.new ?? 0} neue Posts
          </p>
        )}

        <table className="scrape-table">
          <thead>
            <tr><th>Account</th><th>Posts</th><th>Letzter Lauf</th><th>Status</th></tr>
          </thead>
          <tbody>
            {status && Object.entries(status.accounts).map(([name, acc]) => (
              <tr key={name}>
                <td>@{name}</td>
                <td>{acc.posts ?? '–'}</td>
                <td>{formatTs(acc.last_run)} {acc.last_result ? `(${acc.last_result})` : ''}</td>
                <td className={acc.blocked_reason ? 'scrape-blocked' : 'scrape-ok'}>
                  {acc.blocked_reason ?? 'bereit'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="scrape-actions">
          <a className="scrape-link" href={BRAIN_UI_URL}>In Brain UI scrapen / Session importieren →</a>
        </div>
      </div>
    </div>
  );
};

export default ScrapePanel;
