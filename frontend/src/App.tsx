import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import PostGrid from './components/PostGrid';
import PostDetailModal from './components/PostDetailModal';
import SearchFilters from './components/SearchFilters';
import CategorizationModal from './components/CategorizationModal';
import DuplicateDetection from './components/DuplicateDetection';
import CategoriesView from './components/CategoriesView';
import SuggestionsView from './components/SuggestionsView';
import MoreView from './components/MoreView';
import WhoAreYouDialog from './components/WhoAreYouDialog';
import BottomSheet from './components/BottomSheet';
import { useLocalStorage } from './hooks/useLocalStorage';
import type {
  Collection, FilterState, MetaPatch, Person, Post, PostActions, SortOption, Tab, ThemeMode, ViewMode,
} from './types';
import { apiFetch, apiSend, UnauthorizedError, hasApiSecret, setApiSecret, setCurrentAccount } from './utils/api';
import { storageAvailable } from './utils/storage';
import './App.css';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'entdecken', label: 'Entdecken', icon: '▦' },
  { id: 'kategorien', label: 'Kategorien', icon: '🗂' },
  { id: 'vorschlaege', label: 'Vorschläge', icon: '✨' },
  { id: 'mehr', label: 'Mehr', icon: '☰' },
];

const TAB_TITLES: Record<Tab, string> = {
  entdecken: 'Entdecken',
  kategorien: 'Kategorien',
  vorschlaege: 'Vorschläge',
  mehr: 'Mehr',
};

const PERSON_NAMES: Record<Person, string> = { roger: 'Roger', nadine: 'Nadine' };

// A recipe job holds the server lock for at most 15 minutes
const RECIPE_PENDING_MS = 15 * 60 * 1000;

const DEFAULT_FILTERS: FilterState = { searchQuery: '', collection: 'all', hashtag: '', mediaType: 'all' };

function tabFromHash(): Tab {
  const hash = window.location.hash.replace('#', '');
  return (TABS.find(t => t.id === hash)?.id) ?? 'entdecken';
}

function urlForTab(tab: Tab): string {
  return tab === 'entdecken' ? window.location.pathname + window.location.search : `#${tab}`;
}

function matchesCollection(post: Post, collection: Collection): boolean {
  switch (collection) {
    case 'all': return true;
    case 'favorite': return post.favorite;
    case 'tried': return post.tried;
    case 'untried': return !post.tried;
    case 'none': return post.categories.length === 0;
    default: return post.categories.includes(collection.slice(4));
  }
}

interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface DetailState {
  id: string;
  /** Snapshot of the list the post was opened from (swipe order) */
  list: string[];
  enterDir: -1 | 0 | 1;
}

function copyText(text: string): boolean {
  // navigator.clipboard needs a secure context; the LAN app runs on plain http
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(hasApiSecret() || import.meta.env.VITE_NO_AUTH === '1');
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useLocalStorage<string>('selectedAccount', '');

  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('viewMode', 'grid');
  const [sortOption, setSortOption] = useState<SortOption>('date-desc');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [showCategorize, setShowCategorize] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);

  const [theme, setTheme] = useLocalStorage<ThemeMode>('themeMode', 'system');
  const [person, setPerson] = useLocalStorage<Person | null>('person', null);
  // First start: ask once — only if the choice can be stored, otherwise ask at the recipe button
  const [whoPrompt, setWhoPrompt] = useState<{ forRecipe: Post | null } | null>(
    () => (!person && storageAvailable() ? { forRecipe: null } : null),
  );
  const [recipeConfirm, setRecipeConfirm] = useState<Post | null>(null);

  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    window.clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ id, message, actionLabel, onAction });
    toastTimer.current = window.setTimeout(() => setToast(t => (t?.id === id ? null : t)), actionLabel ? 5000 : 3000);
  }, []);

  // --- Theme: system by default, manual choice overrides ---
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyMeta = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#17171c' : '#ffffff'));
    };
    applyMeta();
    media.addEventListener('change', applyMeta);
    return () => media.removeEventListener('change', applyMeta);
  }, [theme]);

  // --- Tabs via hash (#vorschlaege etc. opens directly) ---
  const tabRef = useRef(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    // Closing overlays navigates history; keep the URL in line with the visible tab
    const onPop = () => {
      if (tabFromHash() !== tabRef.current) window.history.replaceState(window.history.state, '', urlForTab(tabRef.current));
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const switchTab = (next: Tab) => {
    if (next === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setTab(next);
    window.history.replaceState(window.history.state, '', urlForTab(next));
    window.scrollTo(0, 0);
  };

  // --- Data loading ---
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/accounts');
      if (res.ok) {
        const data: string[] = await res.json();
        setAccounts(data);
        if (data.length > 0 && !data.includes(selectedAccount)) setSelectedAccount(data[0]);
        if (data.length === 0) setLoading(false);
      }
    } catch (err) {
      if (err instanceof UnauthorizedError) setIsAuthenticated(false);
      else setError('Accounts konnten nicht geladen werden');
    }
  }, [selectedAccount, setSelectedAccount]);

  const fetchPosts = useCallback(async () => {
    try {
      const response = await apiFetch('/api/posts');
      if (!response.ok) throw new Error(`Server antwortet mit ${response.status}`);
      setPosts(await response.json());
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) { setIsAuthenticated(false); return; }
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await apiFetch('/api/categories');
      if (response.ok) setCategories(await response.json());
    } catch (err) {
      if (err instanceof UnauthorizedError) setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    // apiFetch appends ?account= only once one is selected; /api/accounts must go without
    if (isAuthenticated && accounts.length === 0) {
      setCurrentAccount('');
      fetchAccounts();
    }
  }, [isAuthenticated, accounts.length, fetchAccounts]);

  useEffect(() => {
    if (isAuthenticated && selectedAccount && accounts.includes(selectedAccount)) {
      setCurrentAccount(selectedAccount);
      fetchPosts();
      fetchCategories();
    }
  }, [isAuthenticated, selectedAccount, accounts, fetchPosts, fetchCategories]);

  const changeAccount = (account: string) => {
    setLoading(true);
    setDetail(null);
    setFilters(DEFAULT_FILTERS);
    setSelectedAccount(account);
  };

  // --- Post actions (optimistic) ---
  const patchLocal = useCallback((id: string, patch: Partial<Post>) => {
    setPosts(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const addCategoriesLocal = useCallback((cats: string[]) => {
    setCategories(prev => {
      const missing = cats.filter(c => !prev.includes(c));
      return missing.length ? [...prev, ...missing] : prev;
    });
  }, []);

  const actions: PostActions = useMemo(() => {
    const path = (post: Post, suffix = '') => `/api/posts/${encodeURIComponent(post.id)}${suffix}`;

    return {
      updateMeta: (post: Post, patch: MetaPatch) => {
        const before: Partial<Post> = {};
        for (const key of Object.keys(patch) as (keyof MetaPatch)[]) {
          (before as Record<string, unknown>)[key] = post[key];
        }
        const local: Partial<Post> = { ...patch };
        if (patch.categories?.length) local.suggestion = null;
        before.suggestion = post.suggestion;
        patchLocal(post.id, local);
        apiSend(path(post, '/metadata'), 'PUT', patch).catch(() => {
          patchLocal(post.id, before);
          showToast('Speichern fehlgeschlagen');
        });
      },

      acceptSuggestion: (post: Post) => {
        const cat = post.suggestion?.category;
        if (!cat) return;
        const before = { categories: post.categories, suggestion: post.suggestion };
        patchLocal(post.id, {
          categories: post.categories.includes(cat) ? post.categories : [...post.categories, cat],
          suggestion: null,
        });
        addCategoriesLocal([cat]);
        apiSend(path(post, '/accept-suggestion'), 'POST').catch(() => {
          patchLocal(post.id, before);
          showToast('Vorschlag konnte nicht gespeichert werden');
        });
      },

      replaceSuggestion: (post: Post, cats: string[]) => {
        const before = { categories: post.categories, suggestion: post.suggestion };
        patchLocal(post.id, { categories: cats, suggestion: null });
        apiSend(path(post, '/metadata'), 'PUT', { categories: cats })
          .then(() => apiSend(path(post, '/dismiss-suggestion'), 'POST').catch(() => undefined))
          .catch(() => {
            patchLocal(post.id, before);
            showToast('Kategorie konnte nicht gespeichert werden');
          });
      },

      createCategory: async (name: string) => {
        try {
          const res = await apiSend('/api/categories', 'POST', { category: name });
          setCategories(await res.json());
          return true;
        } catch {
          return false;
        }
      },

      remove: (post: Post) => {
        setPosts(prev => prev.filter(p => p.id !== post.id));
        const restoreLocal = () => setPosts(prev => (prev.some(p => p.id === post.id) ? prev : [...prev, post]));
        apiSend(path(post), 'DELETE')
          .then(() => {
            showToast('Gelöscht', 'Rückgängig', () => {
              apiSend(path(post, '/restore'), 'POST')
                .then(() => { restoreLocal(); showToast('Wiederhergestellt'); })
                .catch(() => showToast('Wiederherstellen fehlgeschlagen – siehe Mehr › Papierkorb'));
            });
          })
          .catch(() => {
            restoreLocal();
            showToast('Löschen fehlgeschlagen');
          });
      },

      requestRecipe: (post: Post) => {
        if (post.recipe?.path) {
          showToast('✓ Ist schon im Rezeptbuch');
          return;
        }
        const requested = post.recipe?.requestedAt ? Date.parse(post.recipe.requestedAt) : 0;
        if (requested && Date.now() - requested < RECIPE_PENDING_MS) {
          showToast('Rezept wird schon erstellt – kommt per Telegram');
          return;
        }
        if (!person) {
          setWhoPrompt({ forRecipe: post });
          return;
        }
        setRecipeConfirm(post);
      },

      share: (post: Post) => {
        const url = post.postUrl;
        if (!url) return;
        if (typeof navigator.share === 'function') {
          navigator.share({ url }).catch((err: unknown) => {
            if ((err as Error)?.name !== 'AbortError') showToast(copyText(url) ? 'Link kopiert' : url);
          });
        } else {
          showToast(copyText(url) ? 'Link kopiert' : url);
        }
      },
    };
  }, [patchLocal, addCategoriesLocal, showToast, person]);

  const startRecipe = async (post: Post, who: Person) => {
    setRecipeConfirm(null);
    try {
      const res = await apiFetch(`/api/posts/${encodeURIComponent(post.id)}/recipe`, {
        method: 'POST',
        body: JSON.stringify({ chat: who }),
      });
      if (res.status === 202) {
        const data = await res.json().catch(() => ({}));
        patchLocal(post.id, { recipe: { ...(post.recipe || {}), requestedAt: data.requestedAt || new Date().toISOString() } });
        showToast('Rezept wird erstellt – kommt per Telegram');
      } else if (res.status === 409) {
        showToast('Es läuft schon eine Rezept-Übernahme – bitte später nochmal');
      } else if (res.status === 503) {
        showToast('Rezept-Übernahme ist gerade nicht verfügbar');
      } else {
        showToast('Rezept konnte nicht gestartet werden');
      }
    } catch {
      showToast('Rezept konnte nicht gestartet werden');
    }
  };

  // --- Derived data ---
  const postsById = useMemo(() => new Map(posts.map(p => [p.id, p])), [posts]);

  const hashtags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) for (const tag of post.hashtags) counts.set(tag, (counts.get(tag) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [posts]);

  const counts = useMemo(() => {
    const byCat = new Map<string, number>();
    let favorite = 0, tried = 0, none = 0, suggestions = 0;
    for (const post of posts) {
      if (post.favorite) favorite++;
      if (post.tried) tried++;
      if (post.categories.length === 0) none++;
      if (post.suggestion) suggestions++;
      for (const cat of post.categories) byCat.set(cat, (byCat.get(cat) || 0) + 1);
    }
    return { byCat, favorite, tried, none, suggestions };
  }, [posts]);

  const chipCategories = useMemo(() => {
    const all = new Set([...categories, ...counts.byCat.keys()]);
    return [...all]
      .map(cat => [cat, counts.byCat.get(cat) || 0] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
  }, [categories, counts]);

  const deferredFilters = useDeferredValue(filters);

  const filteredPosts = useMemo(() => {
    const query = deferredFilters.searchQuery.trim().toLowerCase();
    const result = posts.filter(post => {
      if (query) {
        const hay = `${post.caption}\n${post.owner}\n${post.notes}\n${post.location ?? ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      if (!matchesCollection(post, deferredFilters.collection)) return false;
      if (deferredFilters.hashtag && !post.hashtags.includes(deferredFilters.hashtag)) return false;
      if (deferredFilters.mediaType === 'video' && !post.isVideo) return false;
      if (deferredFilters.mediaType === 'image' && post.isVideo) return false;
      return true;
    });
    result.sort((a, b) => (sortOption === 'date-asc'
      ? a.timestamp.localeCompare(b.timestamp)
      : b.timestamp.localeCompare(a.timestamp)));
    return result;
  }, [posts, deferredFilters, sortOption]);

  const gridKey = `${selectedAccount}|${JSON.stringify(deferredFilters)}|${sortOption}|${viewMode}`;
  const sheetFilterActive = filters.hashtag !== '' || filters.mediaType !== 'all' || sortOption !== 'date-desc';
  const anyFilterActive = sheetFilterActive || filters.collection !== 'all' || filters.searchQuery.trim() !== '';

  // --- Detail view ---
  const openDetail = useCallback((id: string, list?: string[]) => {
    setDetail({ id, list: list ?? filteredPosts.map(p => p.id), enterDir: 0 });
  }, [filteredPosts]);

  // Drop deleted posts from the swipe list; move on to a neighbour when the open one is gone
  const detailList = useMemo(() => detail?.list.filter(id => postsById.has(id) || id === detail.id) ?? [], [detail, postsById]);
  const detailIndex = detail ? detailList.indexOf(detail.id) : -1;
  const detailPost = detail ? postsById.get(detail.id) : undefined;

  useEffect(() => {
    if (!detail || detailPost) return;
    const rest = detail.list.filter(id => postsById.has(id));
    const oldIndex = detail.list.indexOf(detail.id);
    const nextId = detail.list.slice(oldIndex + 1).find(id => postsById.has(id))
      ?? detail.list.slice(0, oldIndex).reverse().find(id => postsById.has(id));
    // Deferred to keep the state update out of the render-triggered effect body
    const timer = window.setTimeout(() => {
      setDetail(nextId ? { id: nextId, list: rest, enterDir: 1 } : null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [detail, detailPost, postsById]);

  const navigateDetail = (dir: -1 | 1) => {
    if (!detail) return;
    const target = detailList[detailIndex + dir];
    if (target) setDetail({ ...detail, id: target, enterDir: dir });
  };

  const selectCollection = (collection: Collection) => {
    setFilters(f => ({ ...f, collection }));
    window.scrollTo(0, 0);
  };

  // Keep the active chip visible (e.g. after picking a category tile)
  const chipBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chipBarRef.current?.querySelector('.chip.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [filters.collection, tab]);

  // --- Render ---
  if (!isAuthenticated) {
    return (
      <div className="app">
        <div className="auth-gate">
          <h2>Insta-Merkliste</h2>
          <p>Bitte das API-Passwort eingeben.</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const input = (e.target as HTMLFormElement).elements.namedItem('secret') as HTMLInputElement;
            if (input.value.trim()) {
              setApiSecret(input.value.trim());
              setIsAuthenticated(true);
            }
          }}>
            <input name="secret" type="password" className="text-input" placeholder="API-Passwort" autoFocus />
            <button type="submit" className="btn btn-primary">Weiter</button>
          </form>
        </div>
      </div>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className="app">
        <div className="app-message">
          <h2>Beiträge konnten nicht geladen werden</h2>
          <p>{error}</p>
          <button onClick={() => { setError(null); setLoading(true); fetchAccounts(); fetchPosts(); }} className="btn btn-primary">
            Nochmal versuchen
          </button>
        </div>
      </div>
    );
  }

  const accountSwitcher = accounts.length > 1 && (
    <select
      className="account-switcher"
      value={selectedAccount}
      onChange={(e) => changeAccount(e.target.value)}
      aria-label="Account wählen"
    >
      {accounts.map(acct => <option key={acct} value={acct}>@{acct}</option>)}
    </select>
  );

  const chip = (value: Collection, label: string, count?: number) => (
    <button
      key={value}
      className={`chip ${filters.collection === value ? 'active' : ''}`}
      onClick={() => selectCollection(filters.collection === value && value !== 'all' ? 'all' : value)}
      aria-pressed={filters.collection === value}
    >
      {label}
      {count !== undefined && <span className="chip-count">{count}</span>}
    </button>
  );

  return (
    <div className="app">
      <header className="app-header">
        {tab === 'entdecken' ? (
          <div className="search-row">
            <label className="search-field">
              <span className="search-icon" aria-hidden="true">🔍</span>
              <input
                type="search"
                value={filters.searchQuery}
                onChange={(e) => setFilters(f => ({ ...f, searchQuery: e.target.value }))}
                placeholder="Suchen …"
                aria-label="Beiträge durchsuchen"
                enterKeyHint="search"
              />
              {filters.searchQuery && (
                <button
                  className="search-clear"
                  onClick={() => setFilters(f => ({ ...f, searchQuery: '' }))}
                  aria-label="Suche leeren"
                >
                  ✕
                </button>
              )}
            </label>
            <button
              className={`icon-btn filter-btn ${sheetFilterActive ? 'active' : ''}`}
              onClick={() => setShowFilterSheet(true)}
              aria-label="Filter und Sortierung"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path fill="currentColor" d="M3 6h18v2H3zm3 5h12v2H6zm4 5h4v2h-4z" />
              </svg>
            </button>
            {accountSwitcher}
          </div>
        ) : (
          <div className="title-row">
            <h1>{TAB_TITLES[tab]}</h1>
            {accountSwitcher}
          </div>
        )}
      </header>

      {tab === 'entdecken' && (
        <div className="chip-bar" ref={chipBarRef}>
          {filters.hashtag && (
            <button className="chip active" onClick={() => setFilters(f => ({ ...f, hashtag: '' }))} aria-label={`Hashtag ${filters.hashtag} entfernen`}>
              {filters.hashtag} ✕
            </button>
          )}
          {chip('all', 'Alle')}
          {chip('favorite', '⭐ Favoriten', counts.favorite)}
          {chip('tried', '✓ Ausprobiert', counts.tried)}
          {chip('untried', 'Noch nicht ausprobiert')}
          {chipCategories.map(([cat, n]) => chip(`cat:${cat}`, cat, n))}
          {counts.none > 0 && chip('none', 'Ohne Kategorie', counts.none)}
        </div>
      )}

      <main className="app-main">
        {loading ? (
          <div className="app-message"><div className="spinner" aria-hidden="true" />Lade Beiträge …</div>
        ) : tab === 'entdecken' ? (
          <>
            {anyFilterActive && (
              <div className="result-row">
                <span>{filteredPosts.length} {filteredPosts.length === 1 ? 'Beitrag' : 'Beiträge'}</span>
                <button
                  className="link-btn"
                  onClick={() => { setFilters(DEFAULT_FILTERS); setSortOption('date-desc'); }}
                >
                  Filter zurücksetzen
                </button>
              </div>
            )}
            {filteredPosts.length === 0 ? (
              <div className="app-message">
                {posts.length === 0
                  ? 'Noch keine Beiträge. Laden startest du über Brain UI oder den Telegram-Knopf.'
                  : 'Keine Beiträge passen zu Suche und Filter.'}
              </div>
            ) : (
              <PostGrid key={gridKey} posts={filteredPosts} viewMode={viewMode} onOpen={openDetail} />
            )}
          </>
        ) : tab === 'kategorien' ? (
          <CategoriesView
            posts={posts}
            categories={categories}
            onSelect={(collection) => { setFilters({ ...DEFAULT_FILTERS, collection }); switchTab('entdecken'); }}
            onCategorize={() => setShowCategorize(true)}
          />
        ) : tab === 'vorschlaege' ? (
          <SuggestionsView
            posts={posts}
            categories={categories}
            actions={actions}
            onOpenPost={(id) => openDetail(id, [id])}
          />
        ) : (
          <MoreView
            account={selectedAccount}
            postCount={posts.length}
            theme={theme}
            onThemeChange={setTheme}
            person={person}
            onPersonChange={(p) => { setPerson(p); showToast(`Rezepte gehen jetzt an ${PERSON_NAMES[p]}`); }}
            uncategorizedCount={counts.none}
            onOpenDuplicates={() => setShowDuplicates(true)}
            onOpenCategorize={() => setShowCategorize(true)}
            onRestored={fetchPosts}
            showToast={showToast}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Hauptnavigation">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-item ${tab === t.id ? 'active' : ''}`}
            onClick={() => switchTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="nav-icon" aria-hidden="true">
              {t.icon}
              {t.id === 'vorschlaege' && counts.suggestions > 0 && (
                <span className="nav-badge">{counts.suggestions > 999 ? '999+' : counts.suggestions}</span>
              )}
            </span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {showFilterSheet && (
        <SearchFilters
          filters={filters}
          onFiltersChange={setFilters}
          sortOption={sortOption}
          onSortChange={setSortOption}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          hashtags={hashtags}
          resultCount={filteredPosts.length}
          onClose={() => setShowFilterSheet(false)}
        />
      )}

      {detail && detailPost && (
        <PostDetailModal
          post={detailPost}
          position={detailIndex + 1}
          total={detailList.length}
          hasPrev={detailIndex > 0}
          hasNext={detailIndex < detailList.length - 1}
          enterDir={detail.enterDir}
          categories={categories}
          actions={actions}
          onNavigate={navigateDetail}
          onClose={() => setDetail(null)}
        />
      )}

      {showCategorize && (
        <CategorizationModal
          posts={posts}
          availableCategories={categories}
          onClose={() => setShowCategorize(false)}
          onSave={(post, cats, notes) => actions.updateMeta(post, { categories: cats, notes })}
          onCreateCategory={actions.createCategory}
        />
      )}

      {showDuplicates && (
        <DuplicateDetection
          posts={posts}
          onClose={() => setShowDuplicates(false)}
          onChanged={fetchPosts}
        />
      )}

      {whoPrompt && (
        <WhoAreYouDialog
          reason={whoPrompt.forRecipe ? 'Wer soll das Rezept per Telegram bekommen?' : undefined}
          onClose={() => setWhoPrompt(null)}
          onChoose={(p) => {
            const forRecipe = whoPrompt.forRecipe;
            setPerson(p);
            setWhoPrompt(null);
            if (forRecipe) setRecipeConfirm(forRecipe);
          }}
        />
      )}

      {recipeConfirm && person && (
        <BottomSheet
          title="Als Rezept übernehmen?"
          onClose={() => setRecipeConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRecipeConfirm(null)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={() => startRecipe(recipeConfirm, person)}>🍳 Rezept erstellen</button>
            </>
          }
        >
          <p className="sheet-text">
            Aus diesem Beitrag wird ein Rezept fürs Rezeptbuch erstellt. Das Ergebnis kommt per Telegram an
            {' '}<strong>{PERSON_NAMES[person]}</strong>.
          </p>
          <button className="link-btn" onClick={() => { setRecipeConfirm(null); setWhoPrompt({ forRecipe: recipeConfirm }); }}>
            Nicht {PERSON_NAMES[person]}? Person ändern
          </button>
        </BottomSheet>
      )}

      {toast && (
        <div className="snackbar" role="status" key={toast.id}>
          <span>{toast.message}</span>
          {toast.actionLabel && (
            <button
              className="snackbar-action"
              onClick={() => {
                const action = toast.onAction;
                setToast(null);
                action?.();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
