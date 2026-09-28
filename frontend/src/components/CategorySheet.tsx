import { useState } from 'react';
import BottomSheet from './BottomSheet';
import './CategorySheet.css';

interface CategorySheetProps {
  title?: string;
  categories: string[];
  initialSelected: string[];
  /** Highlighted as "Vorschlag" (e.g. the Jev suggestion) */
  suggested?: string;
  saveLabel?: string;
  onSave: (selected: string[]) => void;
  onCreateCategory: (name: string) => Promise<boolean>;
  onClose: () => void;
}

/** Bottom sheet with category chips (multi-select) and "Neue Kategorie". */
const CategorySheet = ({
  title = 'Kategorien',
  categories,
  initialSelected,
  suggested,
  saveLabel = 'Speichern',
  onSave,
  onCreateCategory,
  onClose,
}: CategorySheetProps) => {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (cat: string) => {
    setSelected(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  };

  const create = async () => {
    const name = newName.trim();
    if (name.length < 2 || name.length > 50) {
      setError('Name muss 2–50 Zeichen lang sein');
      return;
    }
    const existing = categories.find(c => c.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selected.includes(existing)) toggle(existing);
      setNewName('');
      setAdding(false);
      return;
    }
    setBusy(true);
    const ok = await onCreateCategory(name);
    setBusy(false);
    if (!ok) {
      setError('Kategorie konnte nicht angelegt werden');
      return;
    }
    setSelected(prev => [...prev, name]);
    setNewName('');
    setAdding(false);
  };

  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={() => onSave(selected)}>{saveLabel}</button>
        </>
      }
    >
      <div className="category-sheet-chips">
        {categories.map(cat => (
          <button
            key={cat}
            className={`chip ${selected.includes(cat) ? 'active' : ''}`}
            onClick={() => toggle(cat)}
            aria-pressed={selected.includes(cat)}
          >
            {selected.includes(cat) && <span aria-hidden="true">✓</span>}
            {cat}
            {cat === suggested && <span className="chip-hint">Vorschlag</span>}
          </button>
        ))}
        {!adding && (
          <button className="chip chip-add" onClick={() => setAdding(true)}>+ Neue Kategorie</button>
        )}
      </div>

      {adding && (
        <form
          className="category-sheet-new"
          onSubmit={(e) => { e.preventDefault(); create(); }}
        >
          <input
            className="text-input"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setError(''); }}
            placeholder="Name der Kategorie"
            maxLength={50}
            autoFocus
            enterKeyHint="done"
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()}>Anlegen</button>
        </form>
      )}
      {error && <p className="category-sheet-error">{error}</p>}
    </BottomSheet>
  );
};

export default CategorySheet;
