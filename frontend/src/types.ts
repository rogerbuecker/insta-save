// Carousel support
export interface CarouselItem {
  id: string;
  displayUrl: string;
  thumbUrl?: string;
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

// Recipe hand-off state (recipe_bridge.py): requestedAt while running, path once done
export interface RecipeState {
  path?: string;
  requestedAt?: string;
}

// Open Jev suggestion (only set while the post has no category)
export interface CategorySuggestionOpen {
  category: string;
  confidence: number | null;
}

// Raw Jev result as stored in metadata.json
export interface AutoCategory {
  category: string;
  confidence?: number;
  assigned?: boolean;
  model?: string;
  at?: string;
  resolved?: 'accepted' | 'dismissed';
  resolvedAt?: string;
}

export interface Post {
  id: string;
  filename: string;
  timestamp: string;
  caption: string;
  postUrl: string;
  displayUrl: string;
  thumbUrl: string;
  isVideo: boolean;
  videoUrl: string;
  owner: string;
  location: string | null;
  hashtags: string[];
  categories: string[];
  notes: string;
  favorite: boolean;
  tried: boolean;
  recipe: RecipeState | null;
  autoCategory: AutoCategory | null;
  suggestion: CategorySuggestionOpen | null;

  isCarousel: boolean;
  carouselItems: CarouselItem[];
  altText?: string;
  taggedUsers: TaggedUser[];
  engagement: Engagement;
  locationDetails: LocationDetails | null;
}

// Entry of GET /api/trash
export interface TrashItem {
  id: string;
  trashId: string;
  deletedAt: string;
  purgeAt: string;
  caption: string;
  owner: string;
  thumbUrl: string;
}

export type SortOption = 'date-desc' | 'date-asc';

export type ViewMode = 'grid' | 'list';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Person = 'roger' | 'nadine';

export type Tab = 'entdecken' | 'kategorien' | 'vorschlaege' | 'mehr';

// Quick collection shown as chip: all, status filters, "no category" or one category (`cat:<name>`)
export type Collection = 'all' | 'favorite' | 'tried' | 'untried' | 'none' | `cat:${string}`;

export interface FilterState {
  searchQuery: string;
  collection: Collection;
  hashtag: string;
  mediaType: 'all' | 'video' | 'image';
}

// Duplicate detection
export interface DuplicateMatch {
  postIds: [string, string];
  matchScore: number;
  reason: string;
  matchType: 'exact' | 'similar';
}

// Keyword category suggestions (GET /api/posts/:id/suggest-categories)
export interface CategorySuggestion {
  category: string;
  confidence: number;
  matchedKeywords: string[];
}

// Partial metadata update (PUT /api/posts/:id/metadata merges these fields)
export type MetaPatch = Partial<Pick<Post, 'categories' | 'notes' | 'favorite' | 'tried'>>;

// Post actions provided by App (optimistic updates + API calls)
export interface PostActions {
  updateMeta: (post: Post, patch: MetaPatch) => void;
  acceptSuggestion: (post: Post) => void;
  /** Save categories chosen instead of the suggestion and dismiss the suggestion */
  replaceSuggestion: (post: Post, categories: string[]) => void;
  createCategory: (name: string) => Promise<boolean>;
  remove: (post: Post) => void;
  requestRecipe: (post: Post) => void;
  share: (post: Post) => void;
}
