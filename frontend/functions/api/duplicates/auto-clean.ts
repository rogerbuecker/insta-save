// POST /api/duplicates/auto-clean — delete the second post in each exact-duplicate pair
interface Env {
  R2_BUCKET: R2Bucket;
}

async function readMetadata(bucket: R2Bucket) {
  const obj = await bucket.get("metadata.json");
  if (!obj) return { posts: {} as Record<string, any>, categories: [] as string[] };
  return obj.json<{ posts: Record<string, any>; categories: string[] }>();
}

async function writeMetadata(bucket: R2Bucket, metadata: any) {
  await bucket.put("metadata.json", JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const bucket = context.env.R2_BUCKET;

  const indexObj = await bucket.get("posts-index.json");
  if (!indexObj) {
    return Response.json({ deletedCount: 0, deletedIds: [] }, { headers: corsHeaders() });
  }

  const posts = await indexObj.json<any[]>();
  const exactDuplicates = detectExactDuplicates(posts);
  const deletedIds: string[] = [];

  for (const dup of exactDuplicates) {
    const idToDelete = dup.postIds[1];
    if (deletedIds.includes(idToDelete)) continue; // already queued

    await deletePostFiles(bucket, idToDelete);
    deletedIds.push(idToDelete);
  }

  if (deletedIds.length > 0) {
    // Remove deleted posts from metadata
    const metadata = await readMetadata(bucket);
    for (const id of deletedIds) {
      delete metadata.posts[id];
    }
    await writeMetadata(bucket, metadata);

    // Remove deleted posts from index
    const deletedSet = new Set(deletedIds);
    const filtered = posts.filter((p: any) => !deletedSet.has(p.id));
    await bucket.put("posts-index.json", JSON.stringify(filtered), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  return Response.json({ deletedCount: deletedIds.length, deletedIds }, { headers: corsHeaders() });
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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

// --- helpers ---

async function deletePostFiles(bucket: R2Bucket, id: string) {
  const keysToDelete: string[] = [];
  for (const ext of [".json", ".jpg", ".mp4"]) {
    keysToDelete.push(`${id}${ext}`);
  }
  for (let i = 1; i <= 20; i++) {
    keysToDelete.push(`${id}_${i}.jpg`);
    keysToDelete.push(`${id}_${i}.mp4`);
  }
  await Promise.all(keysToDelete.map((key) => bucket.delete(key)));
}

function detectExactDuplicates(posts: any[]) {
  const ONE_HOUR_MS = 3600000;
  const duplicates: { postIds: [string, string] }[] = [];

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

        if ((p1.caption || "") === (p2.caption || "") && timeDiff < ONE_HOUR_MS) {
          duplicates.push({ postIds: [p1.id, p2.id] });
        }
      }
    }
  }

  return duplicates;
}

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split("_");
  if (parts.length < 2) return 0;
  const dateParts = parts[0].split("-");
  const timeParts = parts[1].split("-");
  if (dateParts.length !== 3 || timeParts.length !== 3) return 0;
  return new Date(
    parseInt(dateParts[0]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[2]),
    parseInt(timeParts[0]),
    parseInt(timeParts[1]),
    parseInt(timeParts[2]),
  ).getTime();
}
