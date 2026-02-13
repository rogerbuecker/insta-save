// POST /api/duplicates/merge — merge metadata from deleteId into keepId, then delete
interface Env {
  R2_BUCKET: R2Bucket;
}

function getAccount(request: Request): string | null {
  return new URL(request.url).searchParams.get("account");
}

async function readMetadata(bucket: R2Bucket, account: string) {
  const obj = await bucket.get(`${account}/metadata.json`);
  if (!obj) return { posts: {} as Record<string, any>, categories: [] as string[] };
  return obj.json<{ posts: Record<string, any>; categories: string[] }>();
}

async function writeMetadata(bucket: R2Bucket, account: string, metadata: any) {
  await bucket.put(`${account}/metadata.json`, JSON.stringify(metadata, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const account = getAccount(context.request);
  if (!account) {
    return Response.json({ error: "account parameter is required" }, { status: 400, headers: corsHeaders() });
  }

  const { keepId, deleteId } = await context.request.json<{ keepId: string; deleteId: string }>();

  if (!keepId || !deleteId) {
    return Response.json(
      { error: "keepId and deleteId are required" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const bucket = context.env.R2_BUCKET;
  const metadata = await readMetadata(bucket, account);

  const keepMeta = metadata.posts[keepId] || { categories: [], notes: "" };
  const deleteMeta = metadata.posts[deleteId] || { categories: [], notes: "" };

  const mergedCategories = [...new Set([...(keepMeta.categories || []), ...(deleteMeta.categories || [])])];
  const mergedNotes = [keepMeta.notes, deleteMeta.notes]
    .filter((n: string) => n && n.trim())
    .join("\n---\n");

  metadata.posts[keepId] = { categories: mergedCategories, notes: mergedNotes };

  // Delete the duplicate post's files from R2
  const keysToDelete: string[] = [];
  for (const ext of [".json", ".jpg", ".mp4"]) {
    keysToDelete.push(`${account}/${deleteId}${ext}`);
  }
  for (let i = 1; i <= 20; i++) {
    keysToDelete.push(`${account}/${deleteId}_${i}.jpg`);
    keysToDelete.push(`${account}/${deleteId}_${i}.mp4`);
  }
  await Promise.all(keysToDelete.map((key) => bucket.delete(key)));

  delete metadata.posts[deleteId];
  await writeMetadata(bucket, account, metadata);

  // Remove deleted post from index
  const indexObj = await bucket.get(`${account}/posts-index.json`);
  if (indexObj) {
    const posts = await indexObj.json<any[]>();
    const filtered = posts.filter((p: any) => p.id !== deleteId);
    await bucket.put(`${account}/posts-index.json`, JSON.stringify(filtered), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  return Response.json(
    { success: true, mergedCategories, mergedNotes },
    { headers: corsHeaders() },
  );
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
