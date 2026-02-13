// GET /api/duplicates — detect duplicate posts using the index
interface Env {
  R2_BUCKET: R2Bucket;
}

function getAccount(request: Request): string | null {
  return new URL(request.url).searchParams.get("account");
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const account = getAccount(context.request);
  if (!account) {
    return Response.json({ error: "account parameter is required" }, { status: 400, headers: corsHeaders() });
  }

  const bucket = context.env.R2_BUCKET;

  const indexObj = await bucket.get(`${account}/posts-index.json`);
  if (!indexObj) {
    return Response.json([], { headers: corsHeaders() });
  }

  const posts = await indexObj.json<any[]>();
  const duplicates = detectDuplicates(posts);
  return Response.json(duplicates, { headers: corsHeaders() });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
}

// --- Duplicate detection logic (mirrors server.js) ---

function detectDuplicates(posts: any[]) {
  const ONE_HOUR_MS = 3600000;
  const ONE_DAY_MS = 86400000;
  const duplicates: any[] = [];

  const byOwner = new Map<string, any[]>();
  for (const p of posts) {
    const owner = p.owner || "";
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner)!.push(p);
  }

  for (const ownerPosts of byOwner.values()) {
    for (let i = 0; i < ownerPosts.length; i++) {
      for (let j = i + 1; j < ownerPosts.length; j++) {
        const p1 = ownerPosts[i];
        const p2 = ownerPosts[j];

        const time1 = parseTimestamp(p1.timestamp || p1.id);
        const time2 = parseTimestamp(p2.timestamp || p2.id);
        const timeDiff = Math.abs(time1 - time2);

        const caption1 = p1.caption || "";
        const caption2 = p2.caption || "";

        if (caption1 === caption2 && timeDiff < ONE_HOUR_MS) {
          duplicates.push({
            postIds: [p1.id, p2.id],
            matchScore: 100,
            reason: "Exact: same owner, caption, and time (within 1 hour)",
            matchType: "exact",
          });
        } else if (timeDiff < ONE_DAY_MS) {
          const similarity = calculateSimilarity(caption1, caption2);
          if (similarity > 0.8) {
            duplicates.push({
              postIds: [p1.id, p2.id],
              matchScore: Math.round(similarity * 100),
              reason: "Similar: same owner, similar caption, within 24h",
              matchType: "similar",
            });
          }
        }
      }
    }
  }

  return duplicates.sort((a, b) => b.matchScore - a.matchScore);
}

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split("_");
  if (parts.length < 2) return 0;

  const dateParts = parts[0].split("-");
  const timeParts = parts[1].split("-");
  if (dateParts.length !== 3 || timeParts.length !== 3) return 0;

  const date = new Date(
    parseInt(dateParts[0]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[2]),
    parseInt(timeParts[0]),
    parseInt(timeParts[1]),
    parseInt(timeParts[2]),
  );
  return date.getTime();
}

function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  let intersectionSize = 0;
  for (const w of words1) {
    if (words2.has(w)) intersectionSize++;
  }

  const unionSize = words1.size + words2.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}
