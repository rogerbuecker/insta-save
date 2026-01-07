import React from 'react';
import type { FilterState, SortOption, ViewMode } from '../types';
import './SearchFilters.css';

interface SearchFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  sortOption: SortOption;
  onSortChange: (sort: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  availableHashtags: string[];
  availableCategories: string[];
}

const SearchFilters: React.FC<SearchFiltersProps> = ({
  filters,
  onFiltersChange,
  sortOption,
  onSortChange,
  viewMode,
  onViewModeChange,
  availableHashtags,
  availableCategories,
}) => {
  const updateFilter = (key: keyof FilterState, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  return (
    <div className="search-filters">
      <div className="filters-row">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search captions, usernames..."
            value={filters.searchQuery}
            onChange={(e) => updateFilter('searchQuery', e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <select
            value={filters.category}
            onChange={(e) => updateFilter('category', e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            {availableCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <select
            value={filters.hashtag}
            onChange={(e) => updateFilter('hashtag', e.target.value)}
            className="filter-select"
          >
            <option value="">All Hashtags</option>
            {availableHashtags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <select
            value={filters.mediaType}
            onChange={(e) => updateFilter('mediaType', e.target.value)}
            className="filter-select"
          >
            <option value="all">All Media</option>
            <option value="image">Images Only</option>
            <option value="video">Videos Only</option>
          </select>
        </div>
      </div>

      <div className="controls-row">
        <div className="sort-group">
          <label>Sort by:</label>
          <select
            value={sortOption}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="sort-select"
          >
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
          </select>
        </div>

        <div className="view-toggle">
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            title="Grid View"
          >
            ⊞
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => onViewModeChange('list')}
            title="List View"
          >
            ☰
          </button>
        </div>
      </div>
    </div>
  );
};

export default SearchFilters;
