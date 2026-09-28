import { useState } from 'react';
import type { Person, ThemeMode } from '../types';
import TrashView from './TrashView';
import ScrapePanel from './ScrapePanel';
import { useOverlay } from '../hooks/useOverlay';
import './MoreView.css';

interface MoreViewProps {
  account: string;
  postCount: number;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  person: Person | null;
  onPersonChange: (person: Person) => void;
  uncategorizedCount: number;
  onOpenDuplicates: () => void;
  onOpenCategorize: () => void;
  onRestored: () => void;
  showToast: (message: string) => void;
}

type SubPage = 'trash' | 'scraper' | null;

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

const PEOPLE: { value: Person; label: string }[] = [
  { value: 'nadine', label: 'Nadine' },
  { value: 'roger', label: 'Roger' },
];

/** "Mehr" tab: tools, trash, scraper status and settings. */
const MoreView = ({
  account, postCount, theme, onThemeChange, person, onPersonChange, uncategorizedCount,
  onOpenDuplicates, onOpenCategorize, onRestored, showToast,
}: MoreViewProps) => {
  const [sub, setSub] = useState<SubPage>(null);
  // Sub-pages behave like pages: the back button returns to the menu
  useOverlay(sub !== null, () => setSub(null), false);

  if (sub) {
    return (
      <div className="more">
        <div className="more-subhead">
          <button className="icon-btn" onClick={() => setSub(null)} aria-label="Zurück">←</button>
          <h2>{sub === 'trash' ? 'Papierkorb' : 'Laden (Scraper)'}</h2>
        </div>
        {sub === 'trash'
          ? <TrashView onRestored={onRestored} showToast={showToast} />
          : <ScrapePanel />}
      </div>
    );
  }

  return (
    <div className="more">
      <section className="more-group">
        <h3 className="more-heading">Aufräumen</h3>
        <button className="more-item" onClick={onOpenCategorize} disabled={uncategorizedCount === 0}>
          <span>📋 Kategorisieren</span>
          <span className="more-value">{uncategorizedCount} offen ›</span>
        </button>
        <button className="more-item" onClick={onOpenDuplicates}>
          <span>🔍 Duplikate finden</span>
          <span className="more-value">›</span>
        </button>
        <button className="more-item" onClick={() => setSub('trash')}>
          <span>🗑 Papierkorb</span>
          <span className="more-value">›</span>
        </button>
        <button className="more-item" onClick={() => setSub('scraper')}>
          <span>🔄 Laden-Status</span>
          <span className="more-value">›</span>
        </button>
      </section>

      <section className="more-group">
        <h3 className="more-heading">Design</h3>
        <div className="segmented" role="radiogroup" aria-label="Design">
          {THEMES.map(t => (
            <button
              key={t.value}
              role="radio"
              aria-checked={theme === t.value}
              className={theme === t.value ? 'active' : ''}
              onClick={() => onThemeChange(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="more-group">
        <h3 className="more-heading">Wer bist du?</h3>
        <p className="more-note">Rezepte aus Beiträgen kommen per Telegram an diese Person.</p>
        <div className="segmented" role="radiogroup" aria-label="Wer bist du?">
          {PEOPLE.map(p => (
            <button
              key={p.value}
              role="radio"
              aria-checked={person === p.value}
              className={person === p.value ? 'active' : ''}
              onClick={() => onPersonChange(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="more-group">
        <h3 className="more-heading">Über die App</h3>
        <div className="more-info">
          <div><span>App</span><span>Insta-Merkliste</span></div>
          <div><span>Account</span><span>@{account}</span></div>
          <div><span>Beiträge</span><span>{postCount}</span></div>
          <div><span>Tipp</span><span>Im Browser-Menü „Zum Startbildschirm hinzufügen“</span></div>
        </div>
      </section>
    </div>
  );
};

export default MoreView;
