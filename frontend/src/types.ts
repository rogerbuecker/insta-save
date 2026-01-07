// Carousel support
export interface CarouselItem {
  id: string;
  displayUrl: string;
  isVideo: boolean;
  videoUrl?: string;
  altText?: string;
  dimensions: { width: number; height: number };
  taggedUsers?: TaggedUser[];
}

// Tagged users
export interface TaggedUser {
  id: string;
  username: string;
  fullName: string;
  x: number;  // Position 0-1
  y: number;  // Position 0-1
}

// Location details
export interface LocationDetails {
  id?: string;
  name?: string;
  slug?: string;
}

// Engagement metrics
export interface Engagement {
  likes: number;
  comments: number;
}

export interface Post {
  id: string;
  filename: string;
  timestamp: string;
  data: any;
  caption: string;
  postUrl: string;
  displayUrl: string;
  isVideo: boolean;
  videoUrl: string;
  owner: string;
  location: string | null;
  hashtags: string[];
  categories: string[];
  notes: string;

  // New fields
  isCarousel: boolean;
  carouselItems: CarouselItem[];
  altText?: string;
  taggedUsers: TaggedUser[];
  engagement: Engagement;
  locationDetails: LocationDetails | null;
}

export type SortOption = 'date-desc' | 'date-asc';

export type ViewMode = 'grid' | 'list';

export interface FilterState {
  searchQuery: string;
  category: string;
  hashtag: string;
  mediaType: 'all' | 'video' | 'image';
}

// Search preferences
export interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: number;
}

export interface SearchPreferences {
  searchHistory: string[];
  savedPresets: FilterPreset[];
}

// Grid settings
export interface GridSettings {
  columns: 'auto' | 2 | 3 | 4 | 5 | 6;
  density: 'compact' | 'normal' | 'spacious';
  minColumnWidth: number;
  gap: number;
}

// Smart collections
export interface SmartCollection {
  id: string;
  type: 'hashtag';
  name: string;
  hashtag: string;
  count: number;
}

// Duplicate detection
export interface DuplicateMatch {
  postIds: [string, string];
  matchScore: number;
  reason: string;
  matchType: 'exact' | 'similar';
}

// AI category suggestions
export interface CategorySuggestion {
  category: string;
  confidence: number;
  matchedKeywords: string[];
}
