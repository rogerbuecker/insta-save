import express from 'express';
import cors from 'cors';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.use(compression());
app.use(cors());
app.use(express.json());

const DATA_DIR = process.env.INSTA_SAVE_DATA;
const SAVED_POSTS_BASE = DATA_DIR ? path.join(DATA_DIR, 'saved_posts') : path.join(__dirname, '../saved_posts');
const STATE_DIR = DATA_DIR ? path.join(DATA_DIR, 'state') : path.join(__dirname, '../state');
const PROJECT_ROOT = path.join(__dirname, '..');
const PYTHON = process.env.INSTA_SAVE_PYTHON || path.join(PROJECT_ROOT, 'venv/bin/python');
const SCRAPE_RUN = path.join(PROJECT_ROOT, 'scrape_run.py');
const ACCOUNT_RE = /^[A-Za-z0-9_.]{1,30}$/;

function scrapeRun(args, input) {
  return new Promise((resolve) => {
    const child = execFile(PYTHON, [SCRAPE_RUN, ...args], { cwd: PROJECT_ROOT, env: process.env, timeout: 30000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
  });
}

// Post ids are file stems like 2024-01-01_07-51-26_UTC — nothing else may reach a path.join
const POST_ID_RE = /^[A-Za-z0-9_\-]{1,100}$/;
const BACKUP_DIR = path.join(STATE_DIR, 'backups');
const METADATA_BACKUPS_KEPT = 14;
const TRASH_DIR = '.trash';
const TRASH_RETENTION_MS = 30 * 24 * 3600 * 1000;
const RECIPE_BRIDGE = process.env.INSTA_SAVE_RECIPE_BRIDGE || path.join(PROJECT_ROOT, 'recipe_bridge.py');
const RECIPE_PYTHON = process.env.INSTA_SAVE_RECIPE_PYTHON || '/opt/vault/venv/bin/python3'; // bridge imports vaultbot/telegram_notify
const RECIPE_CHATS = { roger: '419207556', nadine: '163772355' };
const RECIPE_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

// Helper: resolve account-scoped directory (sanitized; no dot-dirs like .trash or ..)
function safeAccount(account) {
  if (!account) throw new Error('account parameter is required');
  const safe = String(account).replace(/[^a-zA-Z0-9_.\-]/g, '');
  if (!safe || safe.startsWith('.')) throw new Error('Invalid account name');
  return safe;
}

function getAccountDir(account) {
  return path.join(SAVED_POSTS_BASE, safeAccount(account));
}

// Write via tmp + rename so a crash never leaves half a JSON file behind
function writeJsonAtomic(file, data, pretty = false) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
  fs.renameSync(tmp, file);
}

// Helper function to read metadata for an account
function readMetadata(account) {
  try {
    const metaFile = path.join(getAccountDir(account), 'metadata.json');
    if (fs.existsSync(metaFile)) {
      const metadata = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      metadata.posts ||= {};
      metadata.categories ||= [];
      return metadata;
    }
  } catch (error) {
    console.error('Error reading metadata:', error);
  }
  return { posts: {}, categories: [] };
}

function localDate(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// At most one copy per account and day of the metadata.json *before* the first write that day;
// only the newest METADATA_BACKUPS_KEPT per account are kept.
function backupMetadata(account, metaFile) {
  try {
    if (!fs.existsSync(metaFile)) return;
    const safe = safeAccount(account);
    const prefix = `${safe}-metadata-`;
    const target = path.join(BACKUP_DIR, `${prefix}${localDate()}.json`);
    if (fs.existsSync(target)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(metaFile, target);
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\.json$/.test(f.slice(prefix.length)))
      .sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - METADATA_BACKUPS_KEPT))) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
  } catch (error) {
    console.error('Error backing up metadata:', error);
  }
}

// Helper function to write metadata for an account
function writeMetadata(account, metadata) {
  try {
    const metaFile = path.join(getAccountDir(account), 'metadata.json');
    backupMetadata(account, metaFile);
    writeJsonAtomic(metaFile, metadata, true);
    return true;
  } catch (error) {
    console.error('Error writing metadata:', error);
    return false;
  }
}

// Partial merge of one post's metadata: only fields present in `patch` change.
// Returns the merged entry or throws on invalid input.
const RECIPE_FIELDS = ['path', 'requestedAt'];
function mergePostMetadata(entry, patch) {
  const out = { categories: [], notes: '', ...entry };
  if (patch.categories !== undefined) {
    out.categories = Array.isArray(patch.categories) ? patch.categories.filter(c => typeof c === 'string') : [];
  }
  if (patch.notes !== undefined) out.notes = typeof patch.notes === 'string' ? patch.notes : '';
  if (patch.favorite !== undefined) out.favorite = Boolean(patch.favorite);
  if (patch.tried !== undefined) out.tried = Boolean(patch.tried);
  if (patch.recipe !== undefined) {
    if (patch.recipe === null) {
      delete out.recipe;
    } else if (typeof patch.recipe === 'object' && !Array.isArray(patch.recipe)) {
      const recipe = { ...(out.recipe || {}) };
      for (const key of RECIPE_FIELDS) {
        if (patch.recipe[key] === null) delete recipe[key];
        else if (typeof patch.recipe[key] === 'string') recipe[key] = patch.recipe[key];
      }
      out.recipe = recipe;
    } else {
      throw new Error('recipe must be an object or null');
    }
  }
  return out;
}

// Open Jev suggestion (categorize.py stores {category, confidence 0..1, assigned, model, at});
// accepted/dismissed ones carry `resolved`.
function openSuggestion(postMeta) {
  const auto = postMeta.autoCategory;
  if (!auto?.category || auto.assigned || auto.resolved) return null;
  if ((postMeta.categories || []).length) return null; // already categorised (by hand or accepted)
  return { category: auto.category, confidence: auto.confidence ?? null };
}

// Metadata fields every post response carries
function postMetaFields(postMeta = {}) {
  return {
    categories: postMeta.categories || [],
    notes: postMeta.notes || '',
    favorite: Boolean(postMeta.favorite),
    tried: Boolean(postMeta.tried),
    recipe: postMeta.recipe || null,
    autoCategory: postMeta.autoCategory || null,
    suggestion: openSuggestion(postMeta),
  };
}

function thumbUrlFor(account, postsDir, id) {
  return fs.existsSync(path.join(postsDir, 'thumbs', `${id}.webp`)) ? `/media/${account}/thumbs/${id}.webp` : '';
}

function readIndex(postsDir) {
  const indexPath = path.join(postsDir, 'posts-index.json');
  if (!fs.existsSync(indexPath)) return null;
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

function writeIndex(postsDir, posts) {
  writeJsonAtomic(path.join(postsDir, 'posts-index.json'), posts);
}

// --- Trash: deleted posts are moved to <account>/.trash/<id>/ and purged after 30 days ---

// All files that belong to a post, relative to the account dir:
// <id>.*, <id>_<n>.* (carousel), thumbs/<id>.webp and gallery-dl's .gdl/<id>.json
function postFiles(postsDir, id) {
  const own = new RegExp(`^${id}(_\\d+)?\\.[A-Za-z0-9]+$`); // id is POST_ID_RE-checked
  const files = fs.readdirSync(postsDir, { withFileTypes: true })
    .filter(d => d.isFile() && own.test(d.name))
    .map(d => d.name);
  for (const rel of [path.join('thumbs', `${id}.webp`), path.join('.gdl', `${id}.json`)]) {
    if (fs.existsSync(path.join(postsDir, rel))) files.push(rel);
  }
  return files;
}

// Move a post into the trash and drop it from index + metadata. Returns its metadata entry.
function trashPost(account, id) {
  if (!POST_ID_RE.test(id)) throw new Error('Invalid post id');
  const postsDir = getAccountDir(account);
  const files = postFiles(postsDir, id);

  const metadata = readMetadata(account);
  const metaEntry = metadata.posts[id] || null;
  const index = readIndex(postsDir);
  const indexEntry = index?.find(p => p.id === id) || null;
  if (!files.length && !metaEntry && !indexEntry) return { found: false, metaEntry: null };

  let trashDir = path.join(postsDir, TRASH_DIR, id);
  // Same post trashed before (re-downloaded since): keep the older copy next to it
  if (fs.existsSync(trashDir)) trashDir = `${trashDir}__${Date.now()}`;
  fs.mkdirSync(trashDir, { recursive: true });
  for (const rel of files) {
    const dest = path.join(trashDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(path.join(postsDir, rel), dest);
  }
  writeJsonAtomic(path.join(trashDir, 'trash.json'), {
    id, account: safeAccount(account), deletedAt: new Date().toISOString(), files, metadata: metaEntry, indexEntry,
  }, true);

  if (indexEntry) writeIndex(postsDir, index.filter(p => p.id !== id));
  if (metaEntry) {
    delete metadata.posts[id];
    writeMetadata(account, metadata);
  }
  return { found: true, metaEntry };
}

function restorePost(account, id) {
  const postsDir = getAccountDir(account);
  const trashDir = path.join(postsDir, TRASH_DIR, id);
  const info = readJson(path.join(trashDir, 'trash.json'));
  if (!info) return { status: 404, error: 'Nicht im Papierkorb' };
  const conflicts = info.files.filter(rel => fs.existsSync(path.join(postsDir, rel)));
  if (conflicts.length) return { status: 409, error: 'Post existiert bereits wieder', conflicts };

  for (const rel of info.files) {
    const dest = path.join(postsDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(path.join(trashDir, rel), dest);
  }
  if (info.indexEntry) {
    const index = readIndex(postsDir) || [];
    if (!index.some(p => p.id === id)) {
      index.push(info.indexEntry);
      index.sort((a, b) => (a.filename || a.id).localeCompare(b.filename || b.id));
      writeIndex(postsDir, index);
    }
  }
  if (info.metadata) {
    const metadata = readMetadata(account);
    // Keep anything written for this id in the meantime, fill the rest from the trash copy
    metadata.posts[id] = { ...info.metadata, ...(metadata.posts[id] || {}) };
    writeMetadata(account, metadata);
  }
  fs.rmSync(trashDir, { recursive: true, force: true });
  return { status: 200, restored: info.files.length };
}

function listAccountDirs() {
  if (!fs.existsSync(SAVED_POSTS_BASE)) return [];
  return fs.readdirSync(SAVED_POSTS_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name);
}

// Permanently remove trash entries older than 30 days (only ever inside <account>/.trash/)
function purgeTrash() {
  const now = Date.now();
  let purged = 0;
  for (const account of listAccountDirs()) {
    const trashBase = path.join(SAVED_POSTS_BASE, account, TRASH_DIR);
    if (!fs.existsSync(trashBase)) continue;
    for (const d of fs.readdirSync(trashBase, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dir = path.join(trashBase, d.name);
      try {
        const info = readJson(path.join(dir, 'trash.json'));
        const deletedAt = info?.deletedAt ? Date.parse(info.deletedAt) : fs.statSync(dir).mtimeMs;
        if (now - deletedAt > TRASH_RETENTION_MS) {
          fs.rmSync(dir, { recursive: true, force: true });
          purged++;
        }
      } catch (error) {
        console.error(`Error purging trash ${dir}:`, error);
      }
    }
  }
  if (purged) console.log(`Papierkorb: ${purged} Posts endgültig gelöscht (> 30 Tage)`);
}

// Serve images/videos from saved_posts directory (subdirs resolve naturally).
// File names never change content (thumbs are only created once), so cache hard.
// Dotfiles (.trash, .gdl) are ignored by express.static.
app.use('/media', express.static(SAVED_POSTS_BASE, { maxAge: '365d', immutable: true }));

// Get available accounts
app.get('/api/accounts', (req, res) => {
  try {
    const accountsFile = path.join(SAVED_POSTS_BASE, 'accounts.json');
    if (fs.existsSync(accountsFile)) {
      const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf-8'));
      return res.json(accounts);
    }
    // Fallback: scan for subdirectories containing posts-index.json
    if (fs.existsSync(SAVED_POSTS_BASE)) {
      const dirs = fs.readdirSync(SAVED_POSTS_BASE, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.') && fs.existsSync(path.join(SAVED_POSTS_BASE, d.name, 'posts-index.json')))
        .map(d => d.name)
        .sort();
      return res.json(dirs);
    }
    res.json([]);
  } catch (error) {
    console.error('Error listing accounts:', error);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

// Get all posts — use prebuilt index if available, fall back to scanning files
app.get('/api/posts', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  const postsDir = getAccountDir(account);
  const indexPath = path.join(postsDir, 'posts-index.json');

  try {
    // Fast path: serve from prebuilt index (generated by crawler's build_index)
    if (fs.existsSync(indexPath)) {
      const posts = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      const metadata = readMetadata(account);

      const merged = posts.map(post => {
        const postMeta = metadata.posts[post.id] || { categories: [], notes: '' };
        return {
          ...post,
          ...postMetaFields(postMeta),
          // Prefix relative media paths for local serving
          displayUrl: post.displayUrl ? `/media/${account}/${post.displayUrl}` : '',
          thumbUrl: post.thumbUrl ? `/media/${account}/${post.thumbUrl}` : '',
          videoUrl: post.videoUrl ? `/media/${account}/${post.videoUrl}` : '',
          carouselItems: (post.carouselItems || []).map(item => ({
            ...item,
            displayUrl: item.displayUrl ? `/media/${account}/${item.displayUrl}` : '',
            videoUrl: item.videoUrl ? `/media/${account}/${item.videoUrl}` : '',
            ...(item.thumbUrl ? { thumbUrl: `/media/${account}/${item.thumbUrl}` } : {}),
          })),
        };
      });

      return res.json(merged);
    }

    // Slow path: scan all JSON files (no index yet)
    if (!fs.existsSync(postsDir)) return res.json([]);
    const files = fs.readdirSync(postsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'metadata.json' && file !== 'posts-index.json');
    const metadata = readMetadata(account);

    const posts = jsonFiles.map(file => {
      const filePath = path.join(postsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const postData = JSON.parse(content);

      const baseId = file.replace('.json', '');

      // Check if local media files exist
      const jpgPath = path.join(postsDir, `${baseId}.jpg`);
      const mp4Path = path.join(postsDir, `${baseId}.mp4`);
      const hasLocalImage = fs.existsSync(jpgPath);
      const hasLocalVideo = fs.existsSync(mp4Path);

      // Get post metadata
      const postMeta = metadata.posts[baseId] || { categories: [], notes: '' };

      // Build Instagram post URL from shortcode
      const shortcode = postData.node?.shortcode || '';
      const postUrl = shortcode ? `https://www.instagram.com/p/${shortcode}/` : '';

      // Extract relevant information
      const node = postData.node;
      const isCarousel = node?.__typename === 'GraphSidecar';
      const isVideo = node?.__typename === 'GraphVideo';

      // Extract carousel items if this is a carousel post
      const carouselItems = [];
      if (isCarousel && node?.edge_sidecar_to_children?.edges) {
        node.edge_sidecar_to_children.edges.forEach((edge, index) => {
          const itemNode = edge.node;
          const itemIsVideo = itemNode.__typename === 'GraphVideo';

          // Check for local carousel media files
          const carouselJpgPath = path.join(postsDir, `${baseId}_${index + 1}.jpg`);
          const carouselMp4Path = path.join(postsDir, `${baseId}_${index + 1}.mp4`);
          const hasCarouselImage = fs.existsSync(carouselJpgPath);
          const hasCarouselVideo = fs.existsSync(carouselMp4Path);

          carouselItems.push({
            id: `${baseId}_${index + 1}`,
            displayUrl: hasCarouselImage ? `/media/${account}/${baseId}_${index + 1}.jpg` : '',
            isVideo: itemIsVideo,
            videoUrl: hasCarouselVideo ? `/media/${account}/${baseId}_${index + 1}.mp4` : '',
            altText: itemNode.accessibility_caption || '',
            dimensions: itemNode.dimensions || { width: 0, height: 0 },
            taggedUsers: extractTaggedUsers(itemNode.edge_media_to_tagged_user)
          });
        });
      }

      return {
        id: baseId,
        filename: file,
        timestamp: file.split('_UTC')[0],
        data: postData,
        caption: node?.edge_media_to_caption?.edges[0]?.node?.text || '',
        postUrl,
        displayUrl: hasLocalImage ? `/media/${account}/${baseId}.jpg` : '',
        thumbUrl: thumbUrlFor(account, postsDir, baseId),
        isVideo,
        videoUrl: hasLocalVideo ? `/media/${account}/${baseId}.mp4` : '',
        owner: node?.owner?.username || 'unknown',
        location: node?.location?.name || null,
        hashtags: extractHashtags(node?.edge_media_to_caption?.edges[0]?.node?.text || ''),
        ...postMetaFields(postMeta),
        isCarousel,
        carouselItems,
        altText: node?.accessibility_caption || '',
        taggedUsers: extractTaggedUsers(node?.edge_media_to_tagged_user),
        engagement: {
          likes: node?.edge_liked_by?.count || 0,
          comments: node?.edge_media_to_comment?.count || 0
        },
        locationDetails: node?.location ? {
          id: node.location.id,
          name: node.location.name,
          slug: node.location.slug
        } : null
      };
    });

    res.json(posts);
  } catch (error) {
    console.error('Error reading posts:', error);
    res.status(500).json({ error: 'Failed to read posts' });
  }
});

// Get single post by ID (formatted Post object)
app.get('/api/posts/:id', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  const { id } = req.params;
  if (!POST_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });
  const postsDir = getAccountDir(account);
  const filePath = path.join(postsDir, `${id}.json`);

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const postData = JSON.parse(content);
    const metadata = readMetadata(account);
    const node = postData.node;

    if (!node) {
      return res.status(404).json({ error: 'Invalid post data' });
    }

    const baseId = id;

    // Check if image or video exists
    const jpgPath = path.join(postsDir, `${baseId}.jpg`);
    const mp4Path = path.join(postsDir, `${baseId}.mp4`);
    const hasImage = fs.existsSync(jpgPath);
    const hasVideo = fs.existsSync(mp4Path);

    // Extract caption
    const caption = node.edge_media_to_caption?.edges[0]?.node?.text || '';
    const hashtags = extractHashtags(caption);

    // Carousel support
    const isCarousel = node.__typename === 'GraphSidecar';
    const carouselItems = [];
    if (isCarousel && node.edge_sidecar_to_children?.edges) {
      node.edge_sidecar_to_children.edges.forEach((edge, index) => {
        const itemNode = edge.node;
        const itemIsVideo = itemNode.__typename === 'GraphVideo';
        const carouselJpgPath = path.join(postsDir, `${baseId}_${index + 1}.jpg`);
        const carouselMp4Path = path.join(postsDir, `${baseId}_${index + 1}.mp4`);
        const hasCarouselImage = fs.existsSync(carouselJpgPath);
        const hasCarouselVideo = fs.existsSync(carouselMp4Path);

        carouselItems.push({
          id: `${baseId}_${index + 1}`,
          displayUrl: hasCarouselImage ? `/media/${account}/${baseId}_${index + 1}.jpg` : '',
          isVideo: itemIsVideo,
          videoUrl: hasCarouselVideo ? `/media/${account}/${baseId}_${index + 1}.mp4` : '',
          altText: itemNode.accessibility_caption || '',
          dimensions: itemNode.dimensions || { width: 0, height: 0 },
          taggedUsers: extractTaggedUsers(itemNode.edge_media_to_tagged_user)
        });
      });
    }

    const post = {
      id: baseId,
      filename: `${baseId}.json`,
      timestamp: baseId,
      data: postData,
      caption,
      postUrl: `https://www.instagram.com/p/${node.shortcode}/`,
      displayUrl: hasImage ? `/media/${account}/${baseId}.jpg` : '',
      thumbUrl: thumbUrlFor(account, postsDir, baseId),
      isVideo: node.__typename === 'GraphVideo',
      videoUrl: hasVideo ? `/media/${account}/${baseId}.mp4` : '',
      owner: node.owner?.username || 'unknown',
      location: node.location?.name || null,
      hashtags,
      ...postMetaFields(metadata.posts[baseId]),
      isCarousel,
      carouselItems,
      altText: node.accessibility_caption || '',
      taggedUsers: extractTaggedUsers(node.edge_media_to_tagged_user),
      engagement: {
        likes: node.edge_liked_by?.count || 0,
        comments: node.edge_media_to_comment?.count || 0
      },
      locationDetails: node.location ? {
        id: node.location.id,
        name: node.location.name,
        slug: node.location.slug
      } : null
    };

    res.json(post);
  } catch (error) {
    console.error('Error reading post:', error);
    res.status(500).json({ error: 'Failed to read post' });
  }
});

// Get categories
app.get('/api/categories', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const metadata = readMetadata(account);
    res.json(metadata.categories || []);
  } catch (error) {
    console.error('Error reading categories:', error);
    res.status(500).json({ error: 'Failed to read categories' });
  }
});

// Add category
app.post('/api/categories', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const category = req.body.category?.trim();
    if (!category || typeof category !== 'string' || category.length === 0 || category.length > 50) {
      return res.status(400).json({ error: 'Category name must be 1-50 characters' });
    }

    const metadata = readMetadata(account);
    if (!metadata.categories.includes(category)) {
      metadata.categories.push(category);
      writeMetadata(account, metadata);
    }
    res.json(metadata.categories);
  } catch (error) {
    console.error('Error adding category:', error);
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// Delete category: removes it from the account's list (= the set categorize.py offers Jev)
// and from every post of that account. Posts whose automatic Jev assignment/suggestion pointed
// at it lose the autoCategory, so the next categorize.py run re-evaluates them.
app.delete('/api/categories/:name', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const category = req.params.name;
    const metadata = readMetadata(account);
    let affected = 0;
    for (const entry of Object.values(metadata.posts)) {
      let touched = false;
      if (Array.isArray(entry.categories) && entry.categories.includes(category)) {
        entry.categories = entry.categories.filter(c => c !== category);
        touched = true;
      }
      if (entry.autoCategory?.category === category) {
        delete entry.autoCategory;
        touched = true;
      }
      if (touched) affected++;
    }
    const known = metadata.categories.includes(category);
    if (!known && affected === 0) return res.status(404).json({ error: 'Category not found' });
    metadata.categories = metadata.categories.filter(c => c !== category);
    if (!writeMetadata(account, metadata)) return res.status(500).json({ error: 'Failed to delete category' });
    res.json({ categories: metadata.categories, affected });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Update post metadata — partial merge: only fields present in the body change
// (categories, notes, favorite, tried, recipe {path, requestedAt}). recipe_bridge.py uses this too.
app.put('/api/posts/:id/metadata', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const { id } = req.params;
    if (!POST_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });

    const metadata = readMetadata(account);
    let entry;
    try {
      entry = mergePostMetadata(metadata.posts[id], req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    metadata.posts[id] = entry;

    if (writeMetadata(account, metadata)) {
      res.json({ success: true, metadata: metadata.posts[id] });
    } else {
      res.status(500).json({ error: 'Failed to save metadata' });
    }
  } catch (error) {
    console.error('Error updating post metadata:', error);
    res.status(500).json({ error: 'Failed to update metadata' });
  }
});

// Accept the Jev suggestion (autoCategory) as a category; the suggestion is marked resolved.
// categorize.py treats the post as manually categorised from then on (assigned stays false).
app.post('/api/posts/:id/accept-suggestion', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });
  const { id } = req.params;
  if (!POST_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });

  try {
    const metadata = readMetadata(account);
    const entry = metadata.posts[id];
    const auto = entry?.autoCategory;
    if (!auto?.category) return res.status(404).json({ error: 'Kein Vorschlag vorhanden' });

    entry.categories = entry.categories || [];
    if (!entry.categories.includes(auto.category)) entry.categories.push(auto.category);
    if (!metadata.categories.includes(auto.category)) metadata.categories.push(auto.category);
    auto.resolved = 'accepted';
    auto.resolvedAt = new Date().toISOString();

    if (!writeMetadata(account, metadata)) return res.status(500).json({ error: 'Failed to save metadata' });
    res.json({ success: true, metadata: entry });
  } catch (error) {
    console.error('Error accepting suggestion:', error);
    res.status(500).json({ error: 'Failed to accept suggestion' });
  }
});

// Dismiss the Jev suggestion without assigning a category
app.post('/api/posts/:id/dismiss-suggestion', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });
  const { id } = req.params;
  if (!POST_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });

  try {
    const metadata = readMetadata(account);
    const entry = metadata.posts[id];
    const auto = entry?.autoCategory;
    if (!auto?.category) return res.status(404).json({ error: 'Kein Vorschlag vorhanden' });

    auto.resolved = 'dismissed';
    auto.resolvedAt = new Date().toISOString();

    if (!writeMetadata(account, metadata)) return res.status(500).json({ error: 'Failed to save metadata' });
    res.json({ success: true, metadata: entry });
  } catch (error) {
    console.error('Error dismissing suggestion:', error);
    res.status(500).json({ error: 'Failed to dismiss suggestion' });
  }
});

// Delete post -> moves it into <account>/.trash/<id>/ (purged after 30 days)
app.delete('/api/posts/:id', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });
  const { id } = req.params;
  if (!POST_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });

  try {
    const { found } = trashPost(account, id);
    if (!found) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true, message: 'Post in den Papierkorb verschoben', trashed: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// Restore a post from the trash (files, index entry, metadata)
app.post('/api/posts/:id/restore', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });
  const { id } = req.params;
  if (!POST_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });

  try {
    const { status, ...result } = restorePost(account, id);
    res.status(status).json(status === 200 ? { success: true, ...result } : result);
  } catch (error) {
    console.error('Error restoring post:', error);
    res.status(500).json({ error: 'Failed to restore post' });
  }
});

// List the trash of an account (newest first)
app.get('/api/trash', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const trashBase = path.join(getAccountDir(account), TRASH_DIR);
    if (!fs.existsSync(trashBase)) return res.json([]);
    const items = [];
    for (const d of fs.readdirSync(trashBase, { withFileTypes: true })) {
      if (!d.isDirectory() || !POST_ID_RE.test(d.name)) continue;
      const info = readJson(path.join(trashBase, d.name, 'trash.json'));
      if (!info) continue;
      const hasThumb = fs.existsSync(path.join(trashBase, d.name, 'thumbs', `${info.id}.webp`));
      items.push({
        id: info.id,
        trashId: d.name,
        deletedAt: info.deletedAt,
        purgeAt: new Date(Date.parse(info.deletedAt) + TRASH_RETENTION_MS).toISOString(),
        caption: info.indexEntry?.caption || '',
        owner: info.indexEntry?.owner || '',
        thumbUrl: hasThumb ? `/api/trash/${encodeURIComponent(d.name)}/thumb?account=${encodeURIComponent(account)}` : '',
        metadata: info.metadata,
      });
    }
    res.json(items.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt))));
  } catch (error) {
    console.error('Error listing trash:', error);
    res.status(500).json({ error: 'Failed to list trash' });
  }
});

// Thumbnail of a trashed post (.trash is a dot-dir and not served under /media)
app.get('/api/trash/:trashId/thumb', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });
  const { trashId } = req.params;
  if (!POST_ID_RE.test(trashId)) return res.status(400).json({ error: 'Invalid id' });
  const id = trashId.split('__')[0];
  const file = path.join(getAccountDir(account), TRASH_DIR, trashId, 'thumbs', `${id}.webp`);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file, { dotfiles: 'allow' });
});

// --- Recipe hand-off (recipe_bridge.py: post -> recipe note, result via Telegram) ---
// One job at a time; the lock is released when the child exits or after 15 min at the latest.
let recipeJob = null;

function releaseRecipeJob(job) {
  if (recipeJob !== job) return;
  clearTimeout(job.timer);
  recipeJob = null;
}

app.post('/api/posts/:id/recipe', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });
  const { id } = req.params;
  if (!POST_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });
  const chatId = RECIPE_CHATS[req.body?.chat];
  if (!chatId) return res.status(400).json({ error: `chat muss einer von ${Object.keys(RECIPE_CHATS).join(', ')} sein` });

  try {
    if (recipeJob) return res.status(409).json({ error: 'Es läuft schon eine Rezept-Übernahme' });
    if (!fs.existsSync(RECIPE_BRIDGE)) return res.status(503).json({ error: 'Rezept-Übernahme ist noch nicht verfügbar' });
    const postsDir = getAccountDir(account);
    if (!fs.existsSync(path.join(postsDir, `${id}.json`))) return res.status(404).json({ error: 'Post not found' });

    const requestedAt = new Date().toISOString();
    const metadata = readMetadata(account);
    metadata.posts[id] = mergePostMetadata(metadata.posts[id], { recipe: { requestedAt } });
    if (!writeMetadata(account, metadata)) return res.status(500).json({ error: 'Failed to save metadata' });

    fs.mkdirSync(path.join(STATE_DIR, 'logs'), { recursive: true });
    const logFile = path.join(STATE_DIR, 'logs', `recipe-${requestedAt.replace(/[:.]/g, '-')}.log`);
    const out = fs.openSync(logFile, 'a');
    const child = spawn(RECIPE_PYTHON, ['-u', RECIPE_BRIDGE, '--account', safeAccount(account), '--post', id, '--chat', chatId],
      { cwd: PROJECT_ROOT, env: process.env, detached: true, stdio: ['ignore', out, out] });
    fs.closeSync(out);

    const job = { pid: child.pid, account, id, chat: req.body.chat, startedAt: requestedAt };
    job.timer = setTimeout(() => releaseRecipeJob(job), RECIPE_LOCK_TIMEOUT_MS);
    recipeJob = job;
    child.on('exit', () => releaseRecipeJob(job));
    child.on('error', (error) => {
      console.error('recipe_bridge failed to start:', error);
      releaseRecipeJob(job);
    });
    child.unref();

    res.status(202).json({ started: true, requestedAt, log: path.basename(logFile) });
  } catch (error) {
    console.error('Error starting recipe hand-off:', error);
    res.status(500).json({ error: 'Failed to start recipe hand-off' });
  }
});

// AI Category Suggestions - keyword mapping
const CATEGORY_KEYWORDS = {
  "Recipes": ["recipe", "cook", "food", "ingredient", "meal", "bake", "#recipe", "#cooking", "#food", "#foodie", "#yummy"],
  "DIY": ["diy", "craft", "make", "build", "handmade", "#diy", "#craft", "#handmade", "#crafts", "selbstgemacht"],
  "Tutorial": ["tutorial", "how to", "guide", "step", "learn", "#tutorial", "anleitung", "lernen"],
  "Funny": ["funny", "hilarious", "laugh", "humor", "comedy", "#funny", "#meme", "#lol", "lustig"],
  "Ideas": ["idea", "inspiration", "creative", "#inspo", "#ideas", "idee"],
  "Projects": ["project", "build", "design", "#project", "projekt"],
  "Watch Later": [], // Manual only
  "Inspiration": ["inspiration", "inspire", "beautiful", "#inspiration", "#inspo", "inspired"]
};

// Get AI-suggested categories for a post
app.get('/api/posts/:id/suggest-categories', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const { id } = req.params;
    if (!POST_ID_RE.test(id)) return res.status(400).json({ error: 'Invalid post id' });
    const filePath = path.join(getAccountDir(account), `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const postData = JSON.parse(content);

    const caption = postData.node?.edge_media_to_caption?.edges[0]?.node?.text || '';
    const hashtags = extractHashtags(caption);
    const text = (caption + ' ' + hashtags.join(' ')).toLowerCase();

    const suggestions = [];
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.length === 0) continue; // Skip manual-only categories

      const matches = keywords.filter(kw => text.includes(kw.toLowerCase()));
      if (matches.length > 0) {
        suggestions.push({
          category,
          confidence: Math.min(100, matches.length * 30),
          matchedKeywords: matches.slice(0, 3) // Limit to top 3 keywords
        });
      }
    }

    // Sort by confidence and return top 3
    // Jev assignment (categorize.py) goes first; keyword matches remain as fallback.
    const auto = readMetadata(account).posts?.[id]?.autoCategory;
    if (auto?.category && !auto.resolved) {
      const rest = suggestions.filter(s => s.category !== auto.category);
      return res.json([
        { category: auto.category, confidence: Math.round(auto.confidence * 100), matchedKeywords: ['Jev'] },
        ...rest.sort((a, b) => b.confidence - a.confidence).slice(0, 2),
      ]);
    }
    res.json(suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3));
  } catch (error) {
    console.error('Error suggesting categories:', error);
    res.status(500).json({ error: 'Failed to suggest categories' });
  }
});

// Get duplicates
app.get('/api/duplicates', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const postsDir = getAccountDir(account);
    if (!fs.existsSync(postsDir)) return res.json([]);
    const files = fs.readdirSync(postsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'metadata.json' && file !== 'posts-index.json');

    const posts = jsonFiles.map(file => {
      const filePath = path.join(postsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const postData = JSON.parse(content);
      const baseId = file.replace('.json', '');

      return {
        id: baseId,
        owner: postData.node?.owner?.username || '',
        caption: postData.node?.edge_media_to_caption?.edges[0]?.node?.text || '',
        timestamp: file.split('_UTC')[0]
      };
    });

    const duplicates = detectDuplicates(posts);
    res.json(duplicates);
  } catch (error) {
    console.error('Error detecting duplicates:', error);
    res.status(500).json({ error: 'Failed to detect duplicates' });
  }
});

// Auto-clean exact duplicates
app.post('/api/duplicates/auto-clean', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const postsDir = getAccountDir(account);
    if (!fs.existsSync(postsDir)) return res.json({ deletedCount: 0, deletedIds: [] });
    const files = fs.readdirSync(postsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json') && file !== 'metadata.json' && file !== 'posts-index.json');

    const posts = jsonFiles.map(file => {
      const filePath = path.join(postsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const postData = JSON.parse(content);
      const baseId = file.replace('.json', '');

      return {
        id: baseId,
        owner: postData.node?.owner?.username || '',
        caption: postData.node?.edge_media_to_caption?.edges[0]?.node?.text || '',
        timestamp: file.split('_UTC')[0]
      };
    });

    const allDuplicates = detectDuplicates(posts);
    const exactDuplicates = allDuplicates.filter(d => d.matchType === 'exact');
    const deletedIds = [];

    for (const dup of exactDuplicates) {
      // Keep first post, move second into the trash
      trashPost(account, dup.postIds[1]);
      deletedIds.push(dup.postIds[1]);
    }

    res.json({ deletedCount: deletedIds.length, deletedIds });
  } catch (error) {
    console.error('Error auto-cleaning duplicates:', error);
    res.status(500).json({ error: 'Failed to auto-clean duplicates' });
  }
});

// Merge duplicate metadata into keepId, move deleteId into the trash
app.post('/api/duplicates/merge', (req, res) => {
  const account = req.query.account;
  if (!account) return res.status(400).json({ error: 'account parameter is required' });

  try {
    const { keepId, deleteId } = req.body;

    if (!keepId || !deleteId) {
      return res.status(400).json({ error: 'keepId and deleteId are required' });
    }
    if (!POST_ID_RE.test(keepId) || !POST_ID_RE.test(deleteId) || keepId === deleteId) {
      return res.status(400).json({ error: 'Invalid post ids' });
    }

    // Trash first: it snapshots deleteId's metadata into trash.json and removes it from metadata.json
    const { metaEntry } = trashPost(account, deleteId);
    const deleteMeta = metaEntry || { categories: [], notes: '' };

    const metadata = readMetadata(account);
    const keepMeta = metadata.posts[keepId] || { categories: [], notes: '' };

    // Merge categories (union)
    const mergedCategories = [...new Set([...(keepMeta.categories || []), ...(deleteMeta.categories || [])])];

    // Merge notes (concatenate with separator)
    const mergedNotes = [keepMeta.notes, deleteMeta.notes]
      .filter(n => n && n.trim())
      .join('\n---\n');

    // Update keep post metadata (other fields of keepId stay; flags are OR-ed)
    metadata.posts[keepId] = {
      ...keepMeta,
      categories: mergedCategories,
      notes: mergedNotes,
      ...((keepMeta.favorite || deleteMeta.favorite) ? { favorite: true } : {}),
      ...((keepMeta.tried || deleteMeta.tried) ? { tried: true } : {}),
      ...((keepMeta.recipe || deleteMeta.recipe) ? { recipe: keepMeta.recipe || deleteMeta.recipe } : {}),
    };

    writeMetadata(account, metadata);

    res.json({ success: true, mergedCategories, mergedNotes });
  } catch (error) {
    console.error('Error merging duplicates:', error);
    res.status(500).json({ error: 'Failed to merge duplicates' });
  }
});


// Helper function to detect duplicates — groups by owner first to avoid O(n²) over all posts
function detectDuplicates(posts) {
  const ONE_HOUR_MS = 3600000;
  const ONE_DAY_MS = 86400000;
  const duplicates = [];

  // Group posts by owner so we only compare within the same owner
  const byOwner = new Map();
  for (const p of posts) {
    if (!byOwner.has(p.owner)) byOwner.set(p.owner, []);
    byOwner.get(p.owner).push(p);
  }

  for (const ownerPosts of byOwner.values()) {
    for (let i = 0; i < ownerPosts.length; i++) {
      for (let j = i + 1; j < ownerPosts.length; j++) {
        const p1 = ownerPosts[i];
        const p2 = ownerPosts[j];

        const time1 = parseTimestamp(p1.timestamp);
        const time2 = parseTimestamp(p2.timestamp);
        const timeDiff = Math.abs(time1 - time2);

        if (p1.caption === p2.caption && timeDiff < ONE_HOUR_MS) {
          duplicates.push({
            postIds: [p1.id, p2.id],
            matchScore: 100,
            reason: 'Exact: same owner, caption, and time (within 1 hour)',
            matchType: 'exact'
          });
        } else if (timeDiff < ONE_DAY_MS) {
          const similarity = calculateSimilarity(p1.caption, p2.caption);
          if (similarity > 0.8) {
            duplicates.push({
              postIds: [p1.id, p2.id],
              matchScore: Math.round(similarity * 100),
              reason: 'Similar: same owner, similar caption, within 24h',
              matchType: 'similar'
            });
          }
        }
      }
    }
  }

  return duplicates.sort((a, b) => b.matchScore - a.matchScore);
}

// Helper function to parse timestamp from filename
function parseTimestamp(timestamp) {
  // Format: 2024-07-26_15-15-24
  const parts = timestamp.split('_');
  if (parts.length !== 2) return 0;

  const dateParts = parts[0].split('-');
  const timeParts = parts[1].split('-');

  if (dateParts.length !== 3 || timeParts.length !== 3) return 0;

  const date = new Date(
    parseInt(dateParts[0]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[2]),
    parseInt(timeParts[0]),
    parseInt(timeParts[1]),
    parseInt(timeParts[2])
  );

  return date.getTime();
}

// Helper function to calculate string similarity (simple Jaccard similarity)
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// Helper function to extract tagged users
function extractTaggedUsers(edgeMediaToTaggedUser) {
  if (!edgeMediaToTaggedUser?.edges) return [];

  return edgeMediaToTaggedUser.edges.map(edge => ({
    id: edge.node.user.id,
    username: edge.node.user.username,
    fullName: edge.node.user.full_name || '',
    x: edge.node.x || 0,
    y: edge.node.y || 0
  }));
}

// Helper function to extract hashtags
function extractHashtags(text) {
  if (!text) return [];
  const hashtagRegex = /#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g;
  const matches = text.match(hashtagRegex);
  return matches ? matches.map(tag => tag.toLowerCase()) : [];
}

// --- Scraper control (manual only, guards live in scrape_run.py) ---
// Starting runs and importing sessions is loopback-only: the LAN has no auth here,
// so these go through the authenticated Brain UI module (/insta-save) instead.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function loopbackOnly(req, res, next) {
  if (LOOPBACK.has(req.socket.remoteAddress)) return next();
  res.status(403).json({ error: 'Nur über Brain UI (/insta-save) möglich' });
}

// Status straight from the state files scrape_run.py writes — no Python spawn per poll.
// Mirrors scrape_run.blocked_reason(); scrape_run.py still enforces every guard itself.
const SESSION_DIR = DATA_DIR ? path.join(DATA_DIR, 'sessions') : path.join(PROJECT_ROOT, 'sessions');
const MIN_INTERVAL_MS = 24 * 3600 * 1000;
const postCountCache = new Map();

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}

function fmtBerlin(date) {
  return date.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    .replace(',', '');
}

function postCount(account) {
  const file = path.join(SAVED_POSTS_BASE, account, 'posts-index.json');
  let mtime;
  try { mtime = fs.statSync(file).mtimeMs; } catch { return null; }
  const cached = postCountCache.get(account);
  if (cached && cached.mtime === mtime) return cached.count;
  const posts = readJson(file, []);
  postCountCache.set(account, { mtime, count: posts.length });
  return posts.length;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function blockedReason(account, state, hasSession, posts) {
  if (!hasSession) return 'keine Session importiert';
  if (posts === null) return 'kein bestehender Datenbestand (Vollabzug wäre ein Sperr-Risiko)';
  const now = Date.now();
  const cooldown = state.cooldown_until ? new Date(state.cooldown_until) : null;
  if (cooldown && cooldown.getTime() > now) {
    return `Cooldown bis ${fmtBerlin(cooldown)} (${state.cooldown_reason || ''})`;
  }
  const nextAllowed = state.next_allowed ? new Date(state.next_allowed)
    : state.last_ok ? new Date(new Date(state.last_ok).getTime() + MIN_INTERVAL_MS) : null;
  if (nextAllowed && nextAllowed.getTime() > now) {
    return `letzter Lauf < 24 h her, wieder ab ${fmtBerlin(nextAllowed)}`;
  }
  return null;
}

function recentRuns(limit) {
  try {
    const lines = fs.readFileSync(path.join(STATE_DIR, 'runs.jsonl'), 'utf-8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map(line => JSON.parse(line));
  } catch { return []; }
}

function scrapeStatus() {
  const running = readJson(path.join(STATE_DIR, 'running.json'));
  const accounts = new Set();
  if (fs.existsSync(SESSION_DIR)) {
    for (const f of fs.readdirSync(SESSION_DIR)) if (f.endsWith('.cookies.txt')) accounts.add(f.slice(0, -'.cookies.txt'.length));
  }
  if (fs.existsSync(SAVED_POSTS_BASE)) {
    for (const d of fs.readdirSync(SAVED_POSTS_BASE, { withFileTypes: true })) {
      if (d.isDirectory() && !d.name.startsWith('.')) accounts.add(d.name);
    }
  }
  const out = {
    running: Boolean(running && isAlive(running.pid)),
    current: readJson(path.join(STATE_DIR, 'current.json')),
    accounts: {},
    recent_runs: recentRuns(10),
  };
  for (const account of [...accounts].sort()) {
    const state = readJson(path.join(STATE_DIR, `${account}.json`), {});
    const hasSession = fs.existsSync(path.join(SESSION_DIR, `${account}.cookies.txt`));
    const posts = postCount(account);
    out.accounts[account] = { ...state, posts, has_session: hasSession, blocked_reason: blockedReason(account, state, hasSession, posts) };
  }
  return out;
}

app.get('/api/scrape/status', (req, res) => {
  res.json(scrapeStatus());
});

app.post('/api/scrape', loopbackOnly, async (req, res) => {
  const accounts = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
  if (!accounts.length || !accounts.every(a => a === 'all' || ACCOUNT_RE.test(a))) {
    return res.status(400).json({ error: 'accounts required' });
  }
  const limit = Math.min(Math.max(parseInt(req.body?.limit, 10) || 100, 1), 200);
  if (scrapeStatus().running) {
    return res.status(409).json({ error: 'Es läuft bereits ein Lauf' });
  }
  fs.mkdirSync(path.join(STATE_DIR, 'logs'), { recursive: true });
  const logFile = path.join(STATE_DIR, 'logs', `${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  const out = fs.openSync(logFile, 'a');
  const args = [SCRAPE_RUN, '--limit', String(limit), ...accounts.flatMap(a => ['--account', a])];
  const child = spawn(PYTHON, ['-u', ...args], { cwd: PROJECT_ROOT, env: process.env, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  fs.closeSync(out);
  res.status(202).json({ started: true, log: path.basename(logFile) });
});

app.post('/api/session', loopbackOnly, async (req, res) => {
  const { sessionid, ds_user_id, csrftoken, mid, user_agent } = req.body || {};
  const account = String(req.body?.account || '').trim().replace(/^@/, '');
  const missing = [['Account', account], ['sessionid', sessionid], ['ds_user_id', ds_user_id]]
    .filter(([, v]) => !String(v || '').trim()).map(([k]) => k);
  if (missing.length) return res.status(400).json({ error: `Fehlt: ${missing.join(', ')}` });
  if (!ACCOUNT_RE.test(account)) {
    return res.status(400).json({ error: 'Ungültiger Account-Name (nur Buchstaben, Zahlen, _ und ., ohne Leerzeichen)' });
  }
  const { code, stdout, stderr } = await scrapeRun(['--import-session', account],
    JSON.stringify({ sessionid, ds_user_id, csrftoken, mid, user_agent }));
  if (code !== 0) return res.status(400).json({ error: (stderr || stdout).trim() });
  res.json({ ok: true, message: stdout.trim() });
});

// Serve the built frontend (production on the homeserver)
const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api\/|\/media\/).*/, (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
}

// Invalid account names (getAccountDir throws) are client errors, not 500s
app.use((err, req, res, next) => {
  if (err?.message === 'Invalid account name' || err?.message === 'account parameter is required') {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// Empty trash entries older than 30 days: once at start, then daily
const runPurge = () => { try { purgeTrash(); } catch (error) { console.error('Error purging trash:', error); } };
runPurge();
setInterval(runPurge, 24 * 3600 * 1000).unref();

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
