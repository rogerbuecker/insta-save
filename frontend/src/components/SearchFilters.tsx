import type { FilterState, SortOption, ViewMode } from '../types';
import BottomSheet from './BottomSheet';
import './SearchFilters.css';

interface SearchFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  /** Hashtags sorted by frequency, with count */
  hashtags: [string, number][];
  resultCount: number;
  onClose: () => void;
}

const MEDIA: { value: FilterState['mediaType']; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'image', label: 'Bilder' },
  { value: 'video', label: 'Videos' },
];

const SORTS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Neueste zuerst' },
  { value: 'date-asc', label: 'Älteste zuerst' },
];

/** Filter & sort bottom sheet (media type, hashtag, sort order, desktop list view). */
const SearchFilters = ({
  filters, onFiltersChange, sortOption, onSortChange, viewMode, onViewModeChange, hashtags, resultCount, onClose,
}: SearchFiltersProps) => {
  const set = (patch: Partial<FilterState>) => onFiltersChange({ ...filters, ...patch });
  const topTags = hashtags.slice(0, 12);

  return (
    <BottomSheet
      title="Filter & Sortierung"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              set({ mediaType: 'all', hashtag: '' });
              onSortChange('date-desc');
            }}
          >
            Zurücksetzen
          </button>
          <button className="btn btn-primary" onClick={onClose}>{resultCount} Beiträge zeigen</button>
        </>
      }
    >
      <div className="filter-block">
        <div className="filter-label">Medientyp</div>
        <div className="segmented">
          {MEDIA.map(m => (
            <button key={m.value} className={filters.mediaType === m.value ? 'active' : ''} onClick={() => set({ mediaType: m.value })}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-label">Sortierung</div>
        <div className="segmented">
          {SORTS.map(s => (
            <button key={s.value} className={sortOption === s.value ? 'active' : ''} onClick={() => onSortChange(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-block">
        <div className="filter-label">Hashtag</div>
        {topTags.length > 0 && (
          <div className="filter-chips">
            {topTags.map(([tag, count]) => (
              <button
                key={tag}
                className={`chip ${filters.hashtag === tag ? 'active' : ''}`}
                onClick={() => set({ hashtag: filters.hashtag === tag ? '' : tag })}
              >
                {tag} <span className="chip-count">{count}</span>
              </button>
            ))}
          </div>
        )}
        <select
          className="text-input"
          value={filters.hashtag}
          onChange={(e) => set({ hashtag: e.target.value })}
          aria-label="Hashtag wählen"
        >
          <option value="">Alle Hashtags</option>
          {hashtags.map(([tag, count]) => (
            <option key={tag} value={tag}>{tag} ({count})</option>
          ))}
        </select>
      </div>

      <div className="filter-block filter-desktop">
        <div className="filter-label">Ansicht</div>
        <div className="segmented">
          <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => onViewModeChange('grid')}>Raster</button>
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => onViewModeChange('list')}>Liste</button>
        </div>
      </div>
    </BottomSheet>
  );
};

export default SearchFilters;
